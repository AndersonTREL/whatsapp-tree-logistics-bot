/**
 * Composes the Sheets client and the model into what the console's routes need.
 *
 * Holds a short-lived cache of the sheet read. Every browser refresh and poll
 * would otherwise be a Sheets API call per viewer, and the whole sheet is only
 * ~600 rows, so one read serves everyone for a few seconds.
 */

const model = require('./model');
const owners = require('./owners');
const clients = require('./clients');
const { OFFICE_FIELDS } = require('./sheets');

const DEFAULT_CACHE_MS = 15000;

class Repository {
  constructor(opts) {
    const options = opts || {};
    this.sheets = options.sheets;
    this.cacheMs = options.cacheMs == null ? DEFAULT_CACHE_MS : options.cacheMs;
    this.now = options.now || function () { return new Date(); };

    this._cache = null;
    this._cachedAt = 0;
    this._inFlight = null;
  }

  invalidate() {
    this._cache = null;
    this._cachedAt = 0;
  }

  /** Cached snapshot. Concurrent callers share one in-flight read. */
  async snapshot(force) {
    const fresh = !force && this._cache && (Date.now() - this._cachedAt) < this.cacheMs;
    if (fresh) return this._cache;

    if (this._inFlight) return this._inFlight;

    const self = this;
    this._inFlight = this._load()
      .then(function (data) {
        self._cache = data;
        self._cachedAt = Date.now();
        return data;
      })
      .finally(function () { self._inFlight = null; });

    return this._inFlight;
  }

  async _load() {
    // A:Z covers the bot columns plus any office columns; the sheet is far narrower.
    const [rows, headers, activity] = await Promise.all([
      this.sheets.getValues('A2:Z'),
      this.sheets.headers(),
      this.sheets.activityByRequest().catch(function () { return {}; })
    ]);

    const fields = headers.fields;
    const reference = this.now();

    // Days from the bot's timestamp to the stamped completion date.
    const resolveDays = function (createdRaw, completedRaw) {
      const created = model.parseSheetTimestamp(createdRaw);
      if (!created || !completedRaw) return null;

      // dashboard.gs writes a real Date, which arrives as a locale string.
      const completed = model.parseSheetTimestamp(completedRaw) || new Date(completedRaw);
      if (!completed || isNaN(completed.getTime())) return null;

      const days = Math.round((completed - created) / 86400000);
      return days < 0 ? null : days;
    };

    const cell = function (row, index) {
      if (!index) return '';
      return String(row[index - 1] == null ? '' : row[index - 1]).trim();
    };

    const requests = rows.map(function (row, i) {
      const id = String(row[5] == null ? '' : row[5]).trim();
      const timestamp = row[0] == null ? '' : row[0];
      const age = model.ageInDays(timestamp, reference);
      const ownerRaw = cell(row, fields.owner);

      return {
        rowNumber: i + 2, // display only - writes always re-resolve by Request ID
        id: id,
        ts: String(timestamp).trim(),
        age: age,
        first: String(row[1] == null ? '' : row[1]).trim(),
        last: String(row[2] == null ? '' : row[2]).trim(),
        station: String(row[3] == null ? '' : row[3]).trim(),
        client: clients.clientOf(row[3]),
        location: clients.locationOf(row[3]),
        text: String(row[4] == null ? '' : row[4]),
        phone: String(row[6] == null ? '' : row[6]).trim(),
        status: String(row[7] == null ? '' : row[7]).trim(),
        ownerRaw: ownerRaw,
        owner: owners.normalizeOwner(ownerRaw),
        priority: cell(row, fields.priority),
        category: cell(row, fields.category),
        contacted: cell(row, fields.contacted),
        action: cell(row, fields.action),
        notes: cell(row, fields.notes),
        completedAt: cell(row, fields.completedAt),
        // Creation -> completion. Only present when dashboard.gs has stamped a
        // completion date; null otherwise, and never guessed from age.
        resolveDays: resolveDays(timestamp, cell(row, fields.completedAt)),
        activity: activity[id] || []
      };
    // Rows with no Request ID cannot be addressed for writes, so they are not
    // shown - but they are left completely untouched in the sheet.
    }).filter(function (r) { return r.id !== ''; });

    model.markDuplicates(requests);

    return {
      requests: requests,
      syncedAt: reference.toISOString(),
      officeColumns: fields
    };
  }

  async getRequest(requestId) {
    const snap = await this.snapshot();
    return snap.requests.find(function (r) { return r.id === requestId; }) || null;
  }

  /**
   * Applies triage changes and records each one in the activity log.
   *
   * @param {string} requestId
   * @param {object} changes - any of status, owner, priority, category, contacted
   * @param {{name:string, team:string}} actor
   */
  async applyTriage(requestId, changes, actor) {
    const before = await this.getRequest(requestId);
    if (!before) {
      const err = new Error('Request ' + requestId + ' not found');
      err.code = 'REQUEST_NOT_FOUND';
      throw err;
    }

    const cells = [];
    const notes = [];

    // Status is the one bot-owned column the console may set, and only to a
    // value the dropdown already offers.
    if (changes.status != null && changes.status !== before.status) {
      if (model.STATUS_OPTIONS.indexOf(changes.status) === -1) {
        const err = new Error('Unknown status: ' + changes.status);
        err.code = 'INVALID_STATUS';
        throw err;
      }
      cells.push({ column: 8, value: changes.status, isStatus: true });
      notes.push('Status set to ' + changes.status + '.');
    }

    const officeChanges = [
      ['owner', 'Owner', function (v) { return 'Assigned to ' + v + '.'; }, function () { return 'Owner cleared.'; }],
      ['priority', 'Priority', function (v) { return 'Priority set to ' + v + '.'; }, function () { return 'Priority cleared.'; }],
      ['category', 'Category', function (v) { return 'Category set to ' + v + '.'; }, function () { return 'Category cleared.'; }],
      ['contacted', 'Contacted', function (v) { return 'Driver contacted via ' + v + '.'; }, function () { return 'Contact method cleared.'; }]
    ];

    for (const [field, , describeSet, describeClear] of officeChanges) {
      if (changes[field] == null) continue;

      const next = String(changes[field]).trim();
      if (next === String(before[field] || '').trim()) continue;

      if (field === 'owner' && next && !owners.isAssignable(next)) {
        const err = new Error('Not an assignable owner: ' + next);
        err.code = 'INVALID_OWNER';
        throw err;
      }
      if (field === 'contacted' && next && model.CONTACT_METHODS.indexOf(next) === -1) {
        const err = new Error('Unknown contact method: ' + next);
        err.code = 'INVALID_CONTACT';
        throw err;
      }

      const column = await this.sheets.ensureOfficeColumn(field);
      cells.push({ column: column, value: next });
      notes.push(next ? describeSet(next) : describeClear());
    }

    if (cells.length === 0) return { changed: false, activity: [], request: before };

    const result = await this.sheets.updateCells(requestId, cells);

    // Every triage change is also an activity entry, so the log explains how a
    // request reached its current state. All of them go in one append.
    const logged = await this._appendActivity(requestId, notes, actor);

    // Patch the cached snapshot rather than throwing it away. Discarding it meant
    // the caller had to re-read all ~600 rows just to see the change it had made.
    const updated = this._patchCached(requestId, changes, logged);

    return { changed: true, row: result.row, activity: logged, request: updated || before };
  }

  /**
   * Applies a just-written change to the cached snapshot, so the next read does
   * not need a Sheets round trip. Falls back to invalidating if there is no cache
   * to patch.
   */
  _patchCached(requestId, changes, loggedEntries) {
    if (!this._cache) return null;

    const request = this._cache.requests.find(function (r) { return r.id === requestId; });
    if (!request) { this.invalidate(); return null; }

    ['status', 'priority', 'category', 'contacted'].forEach(function (field) {
      if (changes[field] != null) request[field] = String(changes[field]).trim();
    });

    if (changes.owner != null) {
      request.ownerRaw = String(changes.owner).trim();
      request.owner = owners.normalizeOwner(request.ownerRaw);
    }

    if (loggedEntries && loggedEntries.length) {
      request.activity = loggedEntries.concat(request.activity || []);
    }

    // A status change can flip a request between open and closed, which changes
    // the duplicate grouping.
    model.markDuplicates(this._cache.requests);

    return request;
  }

  /** Free-text action note from the composer. Empty input is a no-op. */
  async logAction(requestId, text, actor) {
    const body = String(text == null ? '' : text).trim();
    if (!body) return { changed: false, activity: [] };

    const request = await this.getRequest(requestId);
    if (!request) {
      const err = new Error('Request ' + requestId + ' not found');
      err.code = 'REQUEST_NOT_FOUND';
      throw err;
    }

    const logged = await this._appendActivity(requestId, [body], actor);
    const updated = this._patchCached(requestId, {}, logged);

    return { changed: true, activity: logged, request: updated || request };
  }

  async _appendActivity(requestId, texts, actor) {
    const list = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
    if (list.length === 0) return [];

    const loggedAt = this.now().toISOString();
    const author = (actor && actor.name) || 'Unknown';
    const team = (actor && actor.team) || '';

    const entries = list.map(function (text) {
      return { requestId: requestId, loggedAt: loggedAt, author: author, team: team, text: text };
    });

    await this.sheets.appendActivity(entries);

    // Newest first, matching how the detail pane renders them.
    return entries.map(function (e) {
      return { when: e.loggedAt, who: e.author, team: e.team, text: e.text };
    }).reverse();
  }

  async dashboard() {
    const snap = await this.snapshot();
    return {
      syncedAt: snap.syncedAt,
      stats: model.dashboardStats(snap.requests)
    };
  }
}

module.exports = { Repository, OFFICE_FIELDS };
