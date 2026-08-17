/**
 * Driver Requests Dashboard + completion-date tracking
 *
 * Adds a "Dashboard" tab with live KPIs (status mix, throughput per week,
 * workload by owner, volume by station, ageing of open requests) and stamps a
 * "Completed At" date whenever someone marks a request Completed.
 *
 * The dashboard keeps itself current as requests arrive - see "KEEPING THE
 * DASHBOARD CURRENT" below - and fully rebuilds twice a day as a backstop.
 *
 * SETUP:
 *   1. Google Sheet -> Extensions -> Apps Script
 *   2. File -> New -> Script, name it "dashboard", paste this whole file
 *   3. Save, then run "setupDashboard" once and authorise when prompted
 *   4. Reload the spreadsheet - a "TREL" menu appears in the toolbar
 *
 * ALREADY SET UP BEFORE INSTANT REFRESH EXISTED? Paste this file over the old
 * one and run "setupInstantDashboardRefresh" once. Everything else is untouched.
 *
 * NOTE ON NAMING: Apps Script shares one global scope across every file in a
 * project. daily_email_report.gs already declares SHEET_NAME, OPEN_STATUSES and
 * STATUS_COLUMN; redeclaring them here would throw and break the whole project,
 * so everything in this file is DASH_-prefixed.
 */

// ==================== CONFIGURATION ====================

const DASH_SOURCE_SHEET = 'Driver Requests';
const DASH_SHEET = 'Dashboard';

// Column positions in the source sheet (1-indexed)
const DASH_COL_TIMESTAMP = 1; // A
const DASH_COL_STATION   = 4; // D
const DASH_COL_REQUEST   = 5; // E
const DASH_COL_REQID     = 6; // F
const DASH_COL_STATUS    = 8; // H

// These live in the team's section and are found by header name rather than a
// fixed position, so inserting a column will not silently break the dashboard.
const DASH_HEADER_OWNER        = 'Owner';
const DASH_HEADER_PRIORITY     = 'Priority';
const DASH_HEADER_COMPLETED_AT = 'Completed At';

const DASH_OPEN_STATUSES = ['To be contacted', 'Not started', 'needs to be clarified'];
const DASH_DONE_STATUS = 'Completed';
const DASH_STALE_DAYS = 7; // an open request older than this is flagged

// Hours at which the dashboard rebuilds itself. Apps Script treats these as a
// window ("sometime in the 07:00 hour"), not an exact time - so the morning
// refresh is set to 07:00 rather than 08:00 to be safely finished before
// daily_email_report.gs sends the open-requests email at 08:00.
const DASH_REFRESH_HOURS = [7, 15];

// Known spelling variants in the free-text Owner column. Without this,
// "Disaptcher DBE2" and "Dispatcher DBE2" count as two different people.
const DASH_OWNER_FIXES = {
  'disaptcher dbe2': 'Dispatcher DBE2',
  'dispatcher dbe2': 'Dispatcher DBE2',
  'dispacher dbe2': 'Dispatcher DBE2',
  'disaptcher dbe3': 'Dispatcher DBE3',
  'dispatcher dbe3': 'Dispatcher DBE3',
  'dispacher dbe3': 'Dispatcher DBE3',
  'auto team': 'Auto Team',
  'autoteam': 'Auto Team'
};

const DASH_BRAND = '#22783C';

// ==================== MENU ====================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TREL')
    .addItem('🔄 Refresh dashboard', 'buildDashboard')
    .addSeparator()
    .addItem('📧 Send open requests report now', 'sendDailyOpenRequestsReport')
    .addItem('🔍 Check completion tracking', 'dashCompletionTrackingStatus')
    .addItem('⚡ Check dashboard refresh status', 'dashRefreshStatus')
    .addToUi();
}

function setupDashboard() {
  buildDashboard();

  // Clear existing refresh triggers first so re-running this never stacks duplicates
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildDashboard') ScriptApp.deleteTrigger(t);
  });

  DASH_REFRESH_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('buildDashboard').timeBased().atHour(hour).everyDays(1).create();
  });

  // Also keep the dashboard current between those hours.
  setupInstantDashboardRefresh();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Dashboard created. It now updates as requests arrive, and fully rebuilds at ' +
    DASH_REFRESH_HOURS.map(function (h) {
      return (h < 10 ? '0' : '') + h + ':00';
    }).join(' and ') + '.',
    'Setup complete', 10
  );
}

// ==================== KEEPING THE DASHBOARD CURRENT ====================

/**
 * The dashboard used to rebuild only at 07:00 and 15:00, so a request that came
 * in at 15:30 was invisible to anyone working from the Dashboard tab until the
 * next morning. These two triggers close that gap.
 *
 * Two mechanisms on purpose:
 *
 *   dashOnSourceChange  - installable onChange trigger, fires within seconds.
 *                         Unlike the simple onEdit above, an installable
 *                         onChange is reported to fire for Sheets API writes
 *                         (which is how the bot adds rows), but that behaviour
 *                         is not guaranteed by the documentation.
 *   dashWatchdog        - every 5 minutes, as the guarantee. If onChange never
 *                         fires for API appends, nothing is ever more than 5
 *                         minutes stale.
 *
 * Both funnel into dashRefreshIfChanged, which rebuilds only when the source
 * data actually changed, so the redundancy costs almost nothing when idle.
 */

const DASH_WATCHDOG_MINUTES = 5;
const DASH_FINGERPRINT_KEY = 'dashSourceFingerprint';
const DASH_LAST_REFRESH_KEY = 'dashLastRefresh';

/**
 * A cheap signature of the source sheet: how many rows it has, plus the state of
 * the Status column. New requests change the row count; the office marking
 * something Completed changes a status. Either one means the dashboard is out of
 * date. Hashed because Script Properties cap a value at 9KB.
 *
 * Deliberately ignores the Dashboard tab, so the rebuild cannot retrigger itself.
 */
function dashSourceFingerprint(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'empty';

  const statuses = sheet
    .getRange(2, DASH_COL_STATUS, lastRow - 1, 1)
    .getValues()
    .map(function (r) { return String(r[0] || '').trim(); })
    .join('');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, lastRow + '|' + statuses, Utilities.Charset.UTF_8
  );

  return lastRow + ':' + Utilities.base64Encode(digest);
}

/** Rebuilds the dashboard only if the source data moved since the last rebuild. */
function dashRefreshIfChanged(reason) {
  const lock = LockService.getScriptLock();

  // Another refresh is already running - it will pick up this change too.
  if (!lock.tryLock(5000)) return false;

  try {
    const props = PropertiesService.getScriptProperties();
    const fingerprint = dashSourceFingerprint(dashGetSourceSheet());

    if (props.getProperty(DASH_FINGERPRINT_KEY) === fingerprint) return false;

    buildDashboard();
    props.setProperty(DASH_FINGERPRINT_KEY, fingerprint);
    props.setProperty(DASH_LAST_REFRESH_KEY, new Date().toISOString() + ' (' + reason + ')');
    console.log('Dashboard refreshed - ' + reason);
    return true;
  } catch (err) {
    // Never throw from a trigger: a failure here must not stop the next one.
    console.error('Dashboard refresh failed (' + reason + '): ' + err.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Installable onChange handler. Every change type is let through rather than
 * filtered, because the fingerprint check is the real guard and is cheaper than
 * being wrong about which type an API append reports.
 */
function dashOnSourceChange(e) {
  dashRefreshIfChanged('onChange:' + ((e && e.changeType) || 'UNKNOWN'));
}

/** Five-minute safety net in case onChange does not fire for API writes. */
function dashWatchdog() {
  dashRefreshIfChanged('watchdog');
}

/**
 * Installs both triggers. Safe to re-run - it clears its own triggers first.
 * Run this once if the dashboard was set up before instant refresh existed.
 */
function setupInstantDashboardRefresh() {
  const handlers = ['dashOnSourceChange', 'dashWatchdog'];

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('dashOnSourceChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  ScriptApp.newTrigger('dashWatchdog')
    .timeBased()
    .everyMinutes(DASH_WATCHDOG_MINUTES)
    .create();

  // Force the next check to rebuild, so the dashboard is correct straight away.
  PropertiesService.getScriptProperties().deleteProperty(DASH_FINGERPRINT_KEY);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Instant refresh is on. New requests appear within seconds, and never more ' +
    'than ' + DASH_WATCHDOG_MINUTES + ' minutes late.',
    'Triggers installed', 10
  );
}

/** Shows whether the triggers are installed and when the dashboard last rebuilt. */
function dashRefreshStatus() {
  const props = PropertiesService.getScriptProperties();
  const installed = {};

  ScriptApp.getProjectTriggers().forEach(function (t) {
    installed[t.getHandlerFunction()] = true;
  });

  const lines = [
    'Instant (onChange): ' + (installed['dashOnSourceChange'] ? 'installed ✅' : 'MISSING ❌'),
    'Watchdog (' + DASH_WATCHDOG_MINUTES + ' min): ' + (installed['dashWatchdog'] ? 'installed ✅' : 'MISSING ❌'),
    'Daily rebuilds: ' + (installed['buildDashboard'] ? 'installed ✅' : 'MISSING ❌'),
    '',
    'Last rebuild: ' + (props.getProperty(DASH_LAST_REFRESH_KEY) || 'not recorded yet')
  ];

  if (!installed['dashOnSourceChange'] || !installed['dashWatchdog']) {
    lines.push('', 'Run setupInstantDashboardRefresh to install the missing ones.');
  }

  SpreadsheetApp.getUi().alert('Dashboard refresh status', lines.join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ==================== COMPLETION DATE TRACKING ====================

/**
 * Stamps "Completed At" when a request is marked Completed, and clears it if
 * the request is reopened. This is what makes throughput-per-week measurable -
 * the sheet previously recorded only when a request arrived, never when it was
 * resolved.
 *
 * Simple onEdit trigger: fires on manual edits in the UI. It does not fire for
 * writes made through the Sheets API, which is fine - the bot only ever creates
 * rows, it never completes them.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    if (sheet.getName() !== DASH_SOURCE_SHEET) return;

    // Only care about edits touching the Status column
    const firstCol = e.range.getColumn();
    const lastCol = firstCol + e.range.getNumColumns() - 1;
    if (DASH_COL_STATUS < firstCol || DASH_COL_STATUS > lastCol) return;

    const completedCol = dashGetOrCreateColumn(sheet, DASH_HEADER_COMPLETED_AT);
    const firstRow = e.range.getRow();
    const numRows = e.range.getNumRows();

    for (let i = 0; i < numRows; i++) {
      const row = firstRow + i;
      if (row === 1) continue; // header

      const status = String(sheet.getRange(row, DASH_COL_STATUS).getValue() || '').trim();
      const cell = sheet.getRange(row, completedCol);

      if (status.toLowerCase() === DASH_DONE_STATUS.toLowerCase()) {
        // Don't overwrite - the first time it was completed is the real date
        if (!cell.getValue()) {
          cell.setValue(new Date());
          cell.setNumberFormat('dd/MM/yyyy HH:mm');
        }
      } else if (status) {
        // Reopened - the old completion date is no longer true
        cell.clearContent();
      }
    }
  } catch (err) {
    console.error('onEdit completion tracking failed: ' + err.message);
  }
}

/** Reports how much completion data exists yet. Historical dates are unrecoverable. */
function dashCompletionTrackingStatus() {
  const sheet = dashGetSourceSheet();
  const data = sheet.getDataRange().getValues();
  const completedCol = dashGetOrCreateColumn(sheet, DASH_HEADER_COMPLETED_AT);

  let completed = 0, withDate = 0;
  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][DASH_COL_STATUS - 1] || '').trim();
    if (status.toLowerCase() !== DASH_DONE_STATUS.toLowerCase()) continue;
    completed++;
    if (data[i][completedCol - 1]) withDate++;
  }

  SpreadsheetApp.getUi().alert(
    'Completion tracking\n\n' +
    completed + ' requests are marked Completed.\n' +
    withDate + ' of them have a completion date.\n\n' +
    (completed - withDate) + ' were completed before tracking was switched on. Those dates ' +
    'cannot be recovered, so the "completed per week" chart only counts requests ' +
    'completed from now on. It will fill in as your team works.'
  );
}

// ==================== HELPERS ====================

function dashGetSourceSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DASH_SOURCE_SHEET);
  if (!sheet) throw new Error('Sheet "' + DASH_SOURCE_SHEET + '" not found');
  return sheet;
}

/** Finds a column by header name, appending it if missing. Returns 1-indexed position. */
function dashGetOrCreateColumn(sheet, header) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === header.toLowerCase()) return i + 1;
  }

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol)
    .setValue(header)
    .setFontWeight('bold')
    .setBackground(DASH_BRAND)
    .setFontColor('#FFFFFF');
  sheet.setColumnWidth(newCol, 140);
  return newCol;
}

function dashNormalizeOwner(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Unassigned';
  const fix = DASH_OWNER_FIXES[cleaned.toLowerCase()];
  return fix || cleaned;
}

/**
 * Column A is written by the bot as a RAW string ("22/10/2025, 06:58:21"), so
 * it arrives as text rather than a Date. Handle both.
 */
function dashParseDate(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }
  const m = String(value).match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return isNaN(d.getTime()) ? null : d;
}

/** Monday 00:00 of the week containing `date`. */
function dashWeekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Sunday=0 -> 6
  d.setDate(d.getDate() - offset);
  return d;
}

function dashDaysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function dashIsOpen(status) {
  const s = String(status).trim().toLowerCase();
  return DASH_OPEN_STATUSES.some(function (o) { return o.toLowerCase() === s; });
}

function dashSortedEntries(counts) {
  return Object.keys(counts)
    .map(function (k) { return [k, counts[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
}

// ==================== DATA COLLECTION ====================

function dashCollect() {
  const sheet = dashGetSourceSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const ownerCol = dashGetOrCreateColumn(sheet, DASH_HEADER_OWNER);
  const priorityCol = dashGetOrCreateColumn(sheet, DASH_HEADER_PRIORITY);
  const completedCol = dashGetOrCreateColumn(sheet, DASH_HEADER_COMPLETED_AT);

  const now = new Date();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[DASH_COL_STATUS - 1] || '').trim();
    const submitted = dashParseDate(row[DASH_COL_TIMESTAMP - 1]);

    // Skip blank spacer rows
    if (!status && !submitted && !row[DASH_COL_REQID - 1]) continue;

    rows.push({
      rowNumber: i + 1,
      submitted: submitted,
      station: String(row[DASH_COL_STATION - 1] || '').trim() || 'Unknown',
      request: String(row[DASH_COL_REQUEST - 1] || ''),
      requestId: String(row[DASH_COL_REQID - 1] || ''),
      status: status || 'Blank',
      owner: dashNormalizeOwner(row[ownerCol - 1]),
      priority: String(row[priorityCol - 1] || '').trim() || 'Unset',
      completedAt: dashParseDate(row[completedCol - 1]),
      isOpen: dashIsOpen(status),
      isDone: status.toLowerCase() === DASH_DONE_STATUS.toLowerCase(),
      ageDays: submitted ? dashDaysBetween(submitted, now) : null
    });
  }

  return rows;
}

// ==================== DASHBOARD BUILD ====================

function buildDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = dashCollect();

  let sheet = ss.getSheetByName(DASH_SHEET);
  if (!sheet) sheet = ss.insertSheet(DASH_SHEET, 0);

  // Rebuild from scratch so repeated refreshes stay identical (idempotent)
  sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
  sheet.clear();
  sheet.clearConditionalFormatRules();

  const total = rows.length;
  const open = rows.filter(function (r) { return r.isOpen; });
  const done = rows.filter(function (r) { return r.isDone; });
  const stale = open.filter(function (r) { return r.ageDays !== null && r.ageDays > DASH_STALE_DAYS; });

  const resolved = done.filter(function (r) { return r.completedAt && r.submitted; });
  const avgDays = resolved.length
    ? (resolved.reduce(function (sum, r) { return sum + dashDaysBetween(r.submitted, r.completedAt); }, 0) / resolved.length)
    : null;

  // ---- Title ----
  sheet.getRange('A1').setValue('📊 Driver Requests Dashboard')
    .setFontSize(18).setFontWeight('bold').setFontColor(DASH_BRAND);
  sheet.getRange('A2').setValue(
    'Last refreshed: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE d MMMM yyyy, HH:mm')
  ).setFontColor('#777777');

  // ---- KPI tiles ----
  const kpis = [
    ['Total requests', total],
    ['Open', open.length],
    ['Completed', done.length],
    ['Completion rate', total ? (done.length / total) : 0],
    ['Open > ' + DASH_STALE_DAYS + ' days', stale.length],
    ['Avg days to resolve', avgDays === null ? '–' : Math.round(avgDays * 10) / 10]
  ];

  sheet.getRange(4, 1, 1, kpis.length).setValues([kpis.map(function (k) { return k[0]; })])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground(DASH_BRAND)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange(5, 1, 1, kpis.length).setValues([kpis.map(function (k) { return k[1]; })])
    .setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center')
    .setBackground('#F1F7F2');
  sheet.getRange(5, 4).setNumberFormat('0.0%');
  sheet.setRowHeight(4, 26);
  sheet.setRowHeight(5, 44);

  // Red tile if anything is going stale
  sheet.getRange(5, 5).setFontColor(stale.length > 0 ? '#C62828' : '#2E7D32');

  let cursor = 7;

  // ---- Breakdown tables (side by side) ----
  const statusCounts = {}, stationCounts = {}, priorityCounts = {};
  rows.forEach(function (r) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    stationCounts[r.station] = (stationCounts[r.station] || 0) + 1;
    priorityCounts[r.priority] = (priorityCounts[r.priority] || 0) + 1;
  });

  const statusRange = dashWriteTable(sheet, cursor, 1, 'By Status', ['Status', 'Count'], dashSortedEntries(statusCounts));
  const stationRange = dashWriteTable(sheet, cursor, 4, 'By Station', ['Station', 'Count'], dashSortedEntries(stationCounts));
  dashWriteTable(sheet, cursor, 7, 'By Priority', ['Priority', 'Count'], dashSortedEntries(priorityCounts));

  cursor += Math.max(statusRange.rows, stationRange.rows, 3) + 4;

  // ---- Workload by owner ----
  const owners = {};
  rows.forEach(function (r) {
    if (!owners[r.owner]) owners[r.owner] = { total: 0, open: 0, done: 0 };
    owners[r.owner].total++;
    if (r.isOpen) owners[r.owner].open++;
    if (r.isDone) owners[r.owner].done++;
  });

  const ownerRows = Object.keys(owners)
    .map(function (name) {
      const o = owners[name];
      return [name, o.total, o.open, o.done, o.total ? o.done / o.total : 0];
    })
    .sort(function (a, b) { return b[1] - a[1]; });

  const ownerTable = dashWriteTable(
    sheet, cursor, 1, 'Workload by owner',
    ['Owner', 'Total', 'Open', 'Completed', '% Completed'], ownerRows
  );
  if (ownerRows.length) {
    sheet.getRange(ownerTable.firstDataRow, 5, ownerRows.length, 1).setNumberFormat('0%');
  }

  // ---- Completed per week ----
  const weekly = {};
  resolved.forEach(function (r) {
    const key = dashWeekStart(r.completedAt).getTime();
    weekly[key] = (weekly[key] || 0) + 1;
  });

  const weekRows = Object.keys(weekly)
    .map(Number).sort(function (a, b) { return a - b; })
    .slice(-12)
    .map(function (ts) {
      return [Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'dd MMM'), weekly[ts]];
    });

  const weeklyTable = dashWriteTable(
    sheet, cursor, 7, 'Completed per week (last 12)', ['Week starting', 'Completed'],
    weekRows.length ? weekRows : [['No data yet', 0]]
  );

  if (!weekRows.length) {
    sheet.getRange(weeklyTable.firstDataRow + 1, 7)
      .setValue('Completion dates start recording from today.')
      .setFontColor('#777777').setFontStyle('italic');
  }

  cursor += Math.max(ownerTable.rows, weeklyTable.rows, 3) + 4;

  // ---- Oldest open requests (the actionable bit) ----
  const oldest = open
    .filter(function (r) { return r.ageDays !== null; })
    .sort(function (a, b) { return b.ageDays - a.ageDays; })
    .slice(0, 10)
    .map(function (r) {
      return [
        r.ageDays,
        r.station,
        r.owner,
        r.status,
        r.request.length > 70 ? r.request.substring(0, 70) + '…' : r.request
      ];
    });

  const oldestTable = dashWriteTable(
    sheet, cursor, 1, 'Oldest open requests',
    ['Age (days)', 'Station', 'Owner', 'Status', 'Request'],
    oldest.length ? oldest : [['–', '–', '–', 'Nothing open', '–']]
  );

  if (oldest.length) {
    const ageRange = sheet.getRange(oldestTable.firstDataRow, 1, oldest.length, 1);
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(DASH_STALE_DAYS)
      .setBackground('#FFCDD2').setFontColor('#B71C1C')
      .setRanges([ageRange]).build();
    sheet.setConditionalFormatRules([rule]);
  }

  // ---- Charts ----
  dashAddPieChart(sheet, statusRange, 'Status mix', 1, 11);
  dashAddColumnChart(sheet, weeklyTable, 'Completed per week', 20, 11);
  dashAddColumnChart(sheet, stationRange, 'Requests by station', 39, 11);

  // ---- Cosmetics ----
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 320);
  sheet.setColumnWidth(7, 170);
  sheet.setColumnWidth(8, 110);
  sheet.setHiddenGridlines(true);
  ss.setActiveSheet(sheet);

  return { total: total, open: open.length, completed: done.length };
}

/**
 * Writes a titled table and returns its geometry so charts can reference it.
 */
function dashWriteTable(sheet, row, col, title, headers, data) {
  sheet.getRange(row, col).setValue(title)
    .setFontWeight('bold').setFontSize(12).setFontColor(DASH_BRAND);

  sheet.getRange(row + 1, col, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#E8F0E9').setBorder(null, null, true, null, null, null);

  if (data.length) {
    sheet.getRange(row + 2, col, data.length, headers.length).setValues(data);
  }

  return {
    titleRow: row,
    headerRow: row + 1,
    firstDataRow: row + 2,
    numData: data.length,
    col: col,
    numCols: headers.length,
    rows: data.length + 2
  };
}

function dashAddPieChart(sheet, table, title, anchorRow, anchorCol) {
  if (!table.numData) return;
  const chart = sheet.newChart().asPieChart()
    .addRange(sheet.getRange(table.headerRow, table.col, table.numData + 1, 2))
    .setOption('title', title)
    .setOption('height', 260)
    .setOption('width', 420)
    .setOption('pieHole', 0.4)
    .setPosition(anchorRow, anchorCol, 0, 0)
    .build();
  sheet.insertChart(chart);
}

function dashAddColumnChart(sheet, table, title, anchorRow, anchorCol) {
  if (!table.numData) return;
  const chart = sheet.newChart().asColumnChart()
    .addRange(sheet.getRange(table.headerRow, table.col, table.numData + 1, 2))
    .setOption('title', title)
    .setOption('height', 260)
    .setOption('width', 420)
    .setOption('legend', { position: 'none' })
    .setOption('colors', [DASH_BRAND])
    .setPosition(anchorRow, anchorCol, 0, 0)
    .build();
  sheet.insertChart(chart);
}
