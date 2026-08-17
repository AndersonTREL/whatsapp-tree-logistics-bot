/**
 * An in-memory stand-in for the Google Sheets REST API.
 *
 * Enough of the real thing to exercise the console's read and write paths
 * without touching the production spreadsheet: header lookups, column F scans,
 * cell writes, tab creation and appends. Records every write so tests can assert
 * exactly which cells were touched — which is how the "never write A–G" rule is
 * verified rather than assumed.
 */

const API_PREFIX = 'https://sheets.googleapis.com/v4/spreadsheets/';

function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseA1(range) {
  // "A2:Z" | "F:F" | "H12" | "1:1" | "A:E"
  const m = range.match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/i);
  if (!m) return null;
  return {
    startCol: m[1] ? colToIndex(m[1]) : null,
    startRow: m[2] ? parseInt(m[2], 10) : null,
    endCol: m[3] ? colToIndex(m[3]) : (m[4] || m[3] === '' ? null : (m[1] ? colToIndex(m[1]) : null)),
    endRow: m[4] ? parseInt(m[4], 10) : null,
    single: !m[3] && !m[4]
  };
}

class FakeSheets {
  /**
   * @param {object} tabs - { 'Tab name': [[row], [row]] } including the header row
   */
  constructor(tabs) {
    this.tabs = {};
    Object.keys(tabs || {}).forEach((name) => {
      this.tabs[name] = (tabs[name] || []).map((r) => r.slice());
    });

    this.writes = [];   // { sheet, col, row, value }
    this.appends = [];  // { sheet, row }
    this.created = [];  // tab names
    this.requestCount = 0;

    this.fetch = this.fetch.bind(this);
  }

  _grid(name) {
    if (!this.tabs[name]) this.tabs[name] = [];
    return this.tabs[name];
  }

  _set(name, row, col, value) {
    const grid = this._grid(name);
    while (grid.length < row) grid.push([]);
    const target = grid[row - 1];
    while (target.length < col) target.push('');
    target[col - 1] = value;
    this.writes.push({ sheet: name, row, col, value });
  }

  _read(name, range) {
    const grid = this._grid(name);
    const a1 = parseA1(range);
    if (!a1) return [];

    const firstRow = a1.startRow || 1;
    const lastRow = a1.endRow || grid.length;
    const firstCol = a1.startCol || 1;
    const lastCol = a1.endCol || Math.max(1, ...grid.map((r) => r.length));

    const out = [];
    for (let r = firstRow; r <= Math.min(lastRow, grid.length); r++) {
      const row = grid[r - 1] || [];
      const slice = [];
      for (let c = firstCol; c <= lastCol; c++) slice.push(row[c - 1] == null ? '' : row[c - 1]);
      while (slice.length && slice[slice.length - 1] === '') slice.pop();
      out.push(slice);
    }
    // Sheets omits trailing fully-empty rows
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }

  _json(body, status) {
    return {
      ok: !status || status < 400,
      status: status || 200,
      text: async () => JSON.stringify(body)
    };
  }

  async fetch(url, init) {
    this.requestCount++;
    const options = init || {};
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;

    if (!url.startsWith(API_PREFIX)) throw new Error('unexpected url ' + url);

    // Drop the spreadsheet id. What follows starts with '/', '?' or ':'.
    const rest = url.slice(API_PREFIX.length);
    const id = rest.match(/^[^/?:]+/);
    const path = rest.slice(id ? id[0].length : 0);

    // Tab list
    if (path.startsWith('?fields=sheets.properties.title')) {
      return this._json({ sheets: Object.keys(this.tabs).map((t) => ({ properties: { title: t } })) });
    }

    // addSheet
    if (path === ':batchUpdate') {
      const reqs = (body && body.requests) || [];
      reqs.forEach((r) => {
        if (r.addSheet) {
          const title = r.addSheet.properties.title;
          this.tabs[title] = [];
          this.created.push(title);
        }
      });
      return this._json({ replies: [] });
    }

    // batch cell writes
    if (path === '/values:batchUpdate') {
      const data = (body && body.data) || [];
      data.forEach((d) => {
        const { sheet, range } = this._splitRange(d.range);
        const a1 = parseA1(range);
        const startRow = a1.startRow || 1;
        const startCol = a1.startCol || 1;
        (d.values || []).forEach((rowVals, ri) => {
          rowVals.forEach((v, ci) => this._set(sheet, startRow + ri, startCol + ci, v));
        });
      });
      return this._json({ totalUpdatedCells: data.length });
    }

    // append
    const appendMatch = path.match(/^\/values\/(.+?):append/);
    if (appendMatch && method === 'POST') {
      const { sheet } = this._splitRange(decodeURIComponent(appendMatch[1]));
      const grid = this._grid(sheet);
      (body.values || []).forEach((row) => {
        grid.push(row.slice());
        this.appends.push({ sheet, row: row.slice() });
      });
      return this._json({ updates: { updatedRange: sheet + '!A' + grid.length } });
    }

    // single-range PUT / GET
    const valuesMatch = path.match(/^\/values\/([^?]+)/);
    if (valuesMatch) {
      const { sheet, range } = this._splitRange(decodeURIComponent(valuesMatch[1]));

      if (method === 'PUT') {
        const a1 = parseA1(range);
        const startRow = a1.startRow || 1;
        const startCol = a1.startCol || 1;
        (body.values || []).forEach((rowVals, ri) => {
          rowVals.forEach((v, ci) => this._set(sheet, startRow + ri, startCol + ci, v));
        });
        return this._json({ updatedCells: 1 });
      }

      if (!this.tabs[sheet]) return this._json({ error: { message: 'Unable to parse range' } }, 400);
      return this._json({ values: this._read(sheet, range) });
    }

    throw new Error('FakeSheets: unhandled ' + method + ' ' + path);
  }

  _splitRange(a1) {
    const bang = a1.lastIndexOf('!');
    let sheet = a1.slice(0, bang);
    const range = a1.slice(bang + 1);
    if (sheet.startsWith("'") && sheet.endsWith("'")) {
      sheet = sheet.slice(1, -1).replace(/''/g, "'");
    }
    return { sheet, range };
  }

  /** Writes that landed in bot-owned columns A–G. Must always be empty. */
  botColumnWrites() {
    return this.writes.filter((w) => w.sheet === 'Driver Requests' && w.col <= 7);
  }
}

module.exports = { FakeSheets };
