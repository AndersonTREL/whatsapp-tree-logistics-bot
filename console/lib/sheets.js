/**
 * Google Sheets access for the console.
 *
 * Talks to the Sheets REST API directly with a service-account JWT rather than
 * pulling in `googleapis` - the console needs four endpoints, and the lighter
 * dependency loads in milliseconds.
 *
 * SAFETY MODEL (the client's hard constraint, enforced in code):
 *
 *   Columns A-G are the bot's and are NEVER written. assertWritable() throws on
 *   any attempt, so a future bug cannot quietly corrupt a driver's request.
 *   Column H (Status) is the single bot column the console may set, and only via
 *   the exact dropdown values. Everything else the office edits lives in columns
 *   the console resolves BY HEADER NAME and creates if absent.
 *
 *   Rows are always located by Request ID in column F, freshly, on every write.
 *   Never by a cached index: the bot appends rows while the console is open, and
 *   anyone sorting the sheet would otherwise send a write to the wrong driver.
 */

const { JWT } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Bot-owned columns, in the order services/googleSheets.js writes them.
const BOT_COLUMNS = [
  'Timestamp', 'First Name', 'Last Name', 'Station',
  'Request/Question', 'Request ID', 'Phone Number', 'Status'
];
const COL_REQUEST_ID = 6; // F, 1-indexed
const COL_STATUS = 8;     // H
const LAST_BOT_COLUMN = 8;
const FIRST_OFFICE_COLUMN = 9; // I

/**
 * Office fields. `header` is what gets created if the column is missing;
 * `aliases` are the header spellings already in use, so we adopt an existing
 * column instead of creating a duplicate beside it.
 */
const OFFICE_FIELDS = {
  owner:     { header: 'Owner',        aliases: ['owner'] },
  priority:  { header: 'Priority',     aliases: ['priority'] },
  category:  { header: 'Category',     aliases: ['category'] },
  contacted: { header: 'DA Contacted', aliases: ['da contacted', 'contacted', 'driver contacted', 'driver contacted via'] },
  action:    { header: 'Action',       aliases: ['action'] },
  notes:     { header: 'Notes',        aliases: ['notes', 'note'] },
  // Read-only here. google-apps-script/dashboard.gs stamps this when someone
  // marks a request Completed; the console only reads it, to measure how long
  // requests actually took rather than how old they are.
  completedAt: { header: 'Completed At', aliases: ['completed at', 'completedat', 'completion date'] }
};

// Fields the triage form is allowed to write. completedAt is deliberately absent.
const WRITABLE_OFFICE_FIELDS = ['owner', 'priority', 'category', 'contacted', 'action', 'notes'];

const ACTIVITY_HEADERS = ['Logged At', 'Request ID', 'Author', 'Team', 'Action'];

/** 1-indexed column number to an A1 letter: 1 -> A, 27 -> AA. */
function columnLetter(index) {
  let n = index;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Quote a tab name for A1 notation. */
function quoteSheet(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

/**
 * The guard that makes the safety model real. `allowStatus` is passed only by the
 * status write path.
 */
function assertWritable(columnIndex, allowStatus) {
  if (!Number.isInteger(columnIndex) || columnIndex < 1) {
    throw new Error('Refusing to write: invalid column ' + columnIndex);
  }
  if (columnIndex < COL_STATUS) {
    throw new Error(
      'Refusing to write column ' + columnLetter(columnIndex) +
      ': columns A-G belong to the bot and must never be modified'
    );
  }
  if (columnIndex === COL_STATUS && !allowStatus) {
    throw new Error('Refusing to write column H (Status) outside the status field');
  }
  if (columnIndex > LAST_BOT_COLUMN && columnIndex < FIRST_OFFICE_COLUMN) {
    throw new Error('Refusing to write column ' + columnLetter(columnIndex));
  }
  return columnIndex;
}

class SheetsClient {
  /**
   * @param {object} opts
   * @param {string} opts.spreadsheetId
   * @param {string} opts.credentialsJson - service-account JSON (same value the bot uses)
   * @param {string} [opts.sheetName]
   * @param {string} [opts.activitySheetName]
   * @param {function} [opts.fetchImpl] - injectable for tests
   */
  constructor(opts) {
    const options = opts || {};

    this.spreadsheetId = options.spreadsheetId;
    this.sheetName = options.sheetName || 'Driver Requests';
    this.activitySheetName = options.activitySheetName || 'Activity Log';
    this.fetchImpl = options.fetchImpl || global.fetch;
    // Lets tests supply a token instead of signing a real JWT.
    this.tokenProvider = options.tokenProvider || null;

    if (!this.spreadsheetId) throw new Error('spreadsheetId is required');

    this._credentials = null;
    if (options.credentialsJson) {
      try {
        this._credentials = typeof options.credentialsJson === 'string'
          ? JSON.parse(options.credentialsJson)
          : options.credentialsJson;
      } catch (err) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ' + err.message);
      }
    }

    this._jwt = null;
    this._headerCache = null;
    this._titleCache = null;
  }

  /** Cached service-account client. google-auth-library refreshes the token itself. */
  _auth() {
    if (!this._jwt) {
      if (!this._credentials) throw new Error('No Google credentials configured');
      this._jwt = new JWT({
        email: this._credentials.client_email,
        key: this._credentials.private_key,
        scopes: SCOPES
      });
    }
    return this._jwt;
  }

  async _token() {
    if (this.tokenProvider) return await this.tokenProvider();
    const { token } = await this._auth().getAccessToken();
    return token;
  }

  async _request(path, init) {
    const token = await this._token();
    const options = init || {};

    const res = await this.fetchImpl(API + '/' + this.spreadsheetId + path, {
      method: options.method || 'GET',
      headers: Object.assign(
        { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        options.headers || {}
      ),
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON error body */ }

    if (!res.ok) {
      const message = (json && json.error && json.error.message) || text || ('HTTP ' + res.status);
      const err = new Error('Sheets API ' + res.status + ': ' + message);
      err.status = res.status;
      throw err;
    }

    return json;
  }

  async getValues(range) {
    const encoded = encodeURIComponent(quoteSheet(this.sheetName) + '!' + range);
    const body = await this._request('/values/' + encoded);
    return (body && body.values) || [];
  }

  /**
   * Tab titles present in the spreadsheet.
   *
   * Cached: this used to be re-fetched before every single activity append, which
   * cost a Sheets round trip per triage change to re-learn something that cannot
   * change under us — tabs are only added by this class, which refreshes the cache.
   */
  async sheetTitles(force) {
    if (!force && this._titleCache) return this._titleCache;

    const body = await this._request('?fields=sheets.properties.title');
    this._titleCache = ((body && body.sheets) || []).map(function (s) { return s.properties.title; });
    return this._titleCache;
  }

  /**
   * Header row, and the resolved column index of every office field.
   * Cached per instance; call refreshHeaders() after creating a column.
   */
  async headers() {
    if (this._headerCache) return this._headerCache;

    const rows = await this.getValues('1:1');
    const headerRow = rows[0] || [];

    const normalized = headerRow.map(function (h) {
      return String(h == null ? '' : h).trim().toLowerCase();
    });

    const fields = {};
    Object.keys(OFFICE_FIELDS).forEach(function (key) {
      const spec = OFFICE_FIELDS[key];
      const candidates = [spec.header.toLowerCase()].concat(spec.aliases);

      let index = -1;
      for (let i = 0; i < normalized.length; i++) {
        if (candidates.indexOf(normalized[i]) !== -1) { index = i + 1; break; }
      }

      // Only ever adopt a column in the office range.
      fields[key] = index >= FIRST_OFFICE_COLUMN ? index : null;
    });

    this._headerCache = { row: headerRow, fields: fields, width: headerRow.length };
    return this._headerCache;
  }

  refreshHeaders() {
    this._headerCache = null;
  }

  /**
   * Column index for an office field, creating the column if it does not exist.
   * New headers are appended after the last used column, exactly like the Apps
   * Script dashboard does, so nothing existing shifts.
   */
  async ensureOfficeColumn(field) {
    const spec = OFFICE_FIELDS[field];
    if (!spec) throw new Error('Unknown office field: ' + field);
    if (WRITABLE_OFFICE_FIELDS.indexOf(field) === -1) {
      throw new Error('Refusing to create a column for read-only field: ' + field);
    }

    let headers = await this.headers();
    if (headers.fields[field]) return headers.fields[field];

    const target = Math.max(headers.width + 1, FIRST_OFFICE_COLUMN);
    assertWritable(target, false);

    const letter = columnLetter(target);
    await this._request(
      '/values/' + encodeURIComponent(quoteSheet(this.sheetName) + '!' + letter + '1') +
      '?valueInputOption=RAW',
      { method: 'PUT', body: { values: [[spec.header]] } }
    );

    this.refreshHeaders();
    headers = await this.headers();
    return headers.fields[field] || target;
  }

  /**
   * Row number holding a Request ID, read fresh from column F.
   * @returns {Promise<number|null>}
   */
  async findRowByRequestId(requestId) {
    const wanted = String(requestId == null ? '' : requestId).trim();
    if (!wanted) return null;

    const letter = columnLetter(COL_REQUEST_ID);
    const rows = await this.getValues(letter + ':' + letter);

    for (let i = 0; i < rows.length; i++) {
      if (String((rows[i] && rows[i][0]) || '').trim() === wanted) return i + 1;
    }
    return null;
  }

  /**
   * Write cells for one request, addressed by Request ID.
   * @param {string} requestId
   * @param {Array<{column:number, value:string, isStatus?:boolean}>} cells
   */
  async updateCells(requestId, cells) {
    if (!cells || cells.length === 0) return { updated: 0, row: null };

    cells.forEach(function (c) { assertWritable(c.column, !!c.isStatus); });

    const row = await this.findRowByRequestId(requestId);
    if (!row) {
      const err = new Error('Request ' + requestId + ' is not in the sheet');
      err.code = 'REQUEST_NOT_FOUND';
      throw err;
    }
    if (row === 1) throw new Error('Refusing to write the header row');

    const data = cells.map(function (c) {
      const letter = columnLetter(c.column);
      return {
        range: quoteSheet(this.sheetName) + '!' + letter + row,
        values: [[c.value == null ? '' : c.value]]
      };
    }, this);

    await this._request('/values:batchUpdate', {
      method: 'POST',
      body: { valueInputOption: 'USER_ENTERED', data: data }
    });

    return { updated: cells.length, row: row };
  }

  /** Creates the append-only activity tab with its header row if missing. */
  async ensureActivitySheet() {
    const titles = await this.sheetTitles();
    if (titles.indexOf(this.activitySheetName) !== -1) return false;

    await this._request(':batchUpdate', {
      method: 'POST',
      body: {
        requests: [{
          addSheet: {
            properties: { title: this.activitySheetName, gridProperties: { rowCount: 2000, columnCount: ACTIVITY_HEADERS.length } }
          }
        }]
      }
    });

    await this._request(
      '/values/' + encodeURIComponent(quoteSheet(this.activitySheetName) + '!A1') +
      '?valueInputOption=RAW',
      { method: 'PUT', body: { values: [ACTIVITY_HEADERS] } }
    );

    this._titleCache = null; // the tab list just changed
    return true;
  }

  /**
   * Appends one activity row. Append-only: nothing here is ever updated or
   * deleted, which is what makes the log usable as an audit trail.
   */
  async appendActivity(entryOrEntries) {
    const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
    if (entries.length === 0) return [];

    await this.ensureActivitySheet();

    const rows = entries.map(function (entry) {
      return [
        entry.loggedAt || new Date().toISOString(),
        entry.requestId || '',
        entry.author || '',
        entry.team || '',
        entry.text || ''
      ];
    });

    // One call for all of them. Changing four triage fields used to mean four
    // separate appends, and therefore four round trips.
    await this._request(
      '/values/' + encodeURIComponent(quoteSheet(this.activitySheetName) + '!A:E') +
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      { method: 'POST', body: { values: rows } }
    );

    return rows;
  }

  /** All activity rows, newest first, grouped by request ID. */
  async activityByRequest() {
    const titles = await this.sheetTitles();
    if (titles.indexOf(this.activitySheetName) === -1) return {};

    const encoded = encodeURIComponent(quoteSheet(this.activitySheetName) + '!A2:E');
    const body = await this._request('/values/' + encoded);
    const rows = (body && body.values) || [];

    const grouped = {};
    rows.forEach(function (r) {
      const requestId = String(r[1] || '').trim();
      if (!requestId) return;
      if (!grouped[requestId]) grouped[requestId] = [];
      grouped[requestId].push({
        when: r[0] || '',
        who: r[2] || '',
        team: r[3] || '',
        text: r[4] || ''
      });
    });

    Object.keys(grouped).forEach(function (id) {
      grouped[id].reverse(); // newest first
    });

    return grouped;
  }
}

module.exports = {
  SheetsClient,
  BOT_COLUMNS,
  OFFICE_FIELDS,
  WRITABLE_OFFICE_FIELDS,
  ACTIVITY_HEADERS,
  COL_REQUEST_ID,
  COL_STATUS,
  LAST_BOT_COLUMN,
  FIRST_OFFICE_COLUMN,
  columnLetter,
  quoteSheet,
  assertWritable
};
