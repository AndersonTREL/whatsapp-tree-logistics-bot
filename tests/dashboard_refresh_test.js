/**
 * Tests the dashboard auto-refresh logic in google-apps-script/dashboard.gs.
 *
 * Apps Script cannot run locally, so the script is loaded into a VM context with
 * SpreadsheetApp / PropertiesService / LockService / Utilities / ScriptApp
 * stubbed, and buildDashboard replaced with a counter. That is enough to verify
 * the part that actually matters: when a rebuild is and is not triggered.
 *
 * Run: node tests/dashboard_refresh_test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PROJECT = process.env.PROJECT || path.join(__dirname, '..');
const SCRIPT = path.join(PROJECT, 'google-apps-script/dashboard.gs');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  process.stdout.write(`${cond ? '✅' : '❌'} ${name}${cond ? '' : '\n     ' + detail}\n`);
}

// ---- Stubs ----------------------------------------------------------------

function makeSheet(statuses) {
  return {
    _statuses: statuses,
    getName: () => 'Driver Requests',
    // Row 1 is the header, so N status rows means lastRow = N + 1
    getLastRow: () => (statuses.length ? statuses.length + 1 : 1),
    getRange: (row, _col, numRows) => ({
      getValues: () =>
        statuses.slice(row - 2, row - 2 + numRows).map((s) => [s]),
      getValue: () => statuses[row - 2],
      setValue: () => {},
      clearContent: () => {},
      setNumberFormat: () => {},
    }),
    getDataRange: () => ({ getValues: () => [[]] }),
  };
}

function buildContext(sheet) {
  const store = {};
  const state = {
    builds: 0,
    logs: [],
    errors: [],
    lockAvailable: true,
    lockReleased: 0,
    triggers: [],
  };

  const context = {
    console: {
      log: (m) => state.logs.push(String(m)),
      error: (m) => state.errors.push(String(m)),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => (n === 'Driver Requests' ? sheet : null),
        toast: () => {},
      }),
      getUi: () => ({
        createMenu: () => {
          const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} };
          return m;
        },
        alert: (_t, body) => state.logs.push('ALERT:' + body),
        ButtonSet: { OK: 'OK' },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = v; },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => state.lockAvailable,
        releaseLock: () => { state.lockReleased++; },
      }),
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, value) => Array.from(crypto.createHash('md5').update(String(value)).digest()),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    },
    ScriptApp: {
      newTrigger: (fn) => {
        const t = {
          forSpreadsheet: () => t,
          onChange: () => t,
          timeBased: () => t,
          everyMinutes: () => t,
          atHour: () => t,
          everyDays: () => t,
          create: () => { state.triggers.push(fn); },
        };
        return t;
      },
      getProjectTriggers: () => state.triggers.map((fn) => ({
        getHandlerFunction: () => fn,
      })),
      deleteTrigger: (t) => {
        const i = state.triggers.indexOf(t.getHandlerFunction());
        if (i !== -1) state.triggers.splice(i, 1);
      },
    },
    Date,
    JSON,
    String,
    Number,
    Math,
    Object,
    Array,
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), context, { filename: 'dashboard.gs' });

  // Replace the expensive real rebuild with a counter.
  vm.runInContext('buildDashboard = function () { __state.builds++; };', Object.assign(context, { __state: state }));

  return { context, state, store };
}

const call = (ctx, expr) => vm.runInContext(expr, ctx);

// ---- Tests ---------------------------------------------------------------

// 1. First run must rebuild (no fingerprint stored yet)
{
  const { context, state } = buildContext(makeSheet(['To be contacted', 'Completed']));
  call(context, 'dashWatchdog()');
  check('first check rebuilds the dashboard', state.builds === 1, `builds=${state.builds}`);
}

// 2. Nothing changed -> no rebuild (this is what makes a 5-minute trigger cheap)
{
  const { context, state } = buildContext(makeSheet(['To be contacted', 'Completed']));
  call(context, 'dashWatchdog()');
  call(context, 'dashWatchdog()');
  call(context, 'dashWatchdog()');
  check('repeat checks with no change do not rebuild', state.builds === 1, `builds=${state.builds}`);
}

// 3. A new driver request (extra row) must rebuild
{
  const sheet = makeSheet(['To be contacted']);
  const { context, state } = buildContext(sheet);
  call(context, 'dashWatchdog()');
  sheet._statuses.push('To be contacted'); // bot appends a new request
  call(context, 'dashWatchdog()');
  check('a newly arrived request triggers a rebuild', state.builds === 2, `builds=${state.builds}`);
}

// 4. A status edit (same row count) must also rebuild
{
  const sheet = makeSheet(['To be contacted', 'To be contacted']);
  const { context, state } = buildContext(sheet);
  call(context, 'dashWatchdog()');
  sheet._statuses[1] = 'Completed'; // office marks one done
  call(context, 'dashWatchdog()');
  check('a status change triggers a rebuild', state.builds === 2, `builds=${state.builds}`);
}

// 5. onChange path behaves the same, and cannot loop on its own rebuild
{
  const sheet = makeSheet(['To be contacted']);
  const { context, state } = buildContext(sheet);
  call(context, 'dashOnSourceChange({ changeType: "INSERT_ROW" })');
  const afterFirst = state.builds;
  // The rebuild writes to the Dashboard tab, which fires onChange again. The
  // fingerprint covers only the source sheet, so this must be a no-op.
  call(context, 'dashOnSourceChange({ changeType: "OTHER" })');
  call(context, 'dashOnSourceChange({ changeType: "EDIT" })');
  check('onChange rebuilds on a new row', afterFirst === 1, `builds=${afterFirst}`);
  check('onChange does not loop on its own dashboard write', state.builds === 1,
    `builds=${state.builds}`);
}

// 6. An onChange event with no changeType must not throw
{
  const { context, state } = buildContext(makeSheet(['To be contacted']));
  let threw = false;
  try { call(context, 'dashOnSourceChange(undefined)'); } catch (e) { threw = true; }
  check('onChange survives a malformed event', !threw && state.builds === 1,
    `threw=${threw} builds=${state.builds}`);
}

// 7. Lock contention: skip quietly, never rebuild twice concurrently
{
  const { context, state } = buildContext(makeSheet(['To be contacted']));
  state.lockAvailable = false;
  call(context, 'dashWatchdog()');
  check('a concurrent refresh is skipped, not duplicated', state.builds === 0,
    `builds=${state.builds}`);
}

// 8. The lock is always released, even when the rebuild throws
{
  const { context, state } = buildContext(makeSheet(['To be contacted']));
  vm.runInContext('buildDashboard = function () { throw new Error("boom"); };', context);
  let threw = false;
  try { call(context, 'dashWatchdog()'); } catch (e) { threw = true; }
  check('a failing rebuild does not throw out of the trigger', !threw, 'it threw');
  check('the lock is released after a failure', state.lockReleased === 1,
    `released=${state.lockReleased}`);
  check('the failure is logged for the execution log', state.errors.length === 1,
    JSON.stringify(state.errors));
}

// 9. A failed rebuild must not record the fingerprint, so the next run retries
{
  const { context, state, store } = buildContext(makeSheet(['To be contacted']));
  vm.runInContext('buildDashboard = function () { throw new Error("boom"); };', context);
  call(context, 'dashWatchdog()');
  check('a failed rebuild leaves no fingerprint, so it retries', !store.dashSourceFingerprint,
    `fingerprint=${store.dashSourceFingerprint}`);

  vm.runInContext('buildDashboard = function () { __state.builds++; };', context);
  call(context, 'dashWatchdog()');
  check('the retry after a failure succeeds', state.builds === 1, `builds=${state.builds}`);
}

// 10. Setup installs both triggers and is safe to run twice
{
  const { context, state } = buildContext(makeSheet(['To be contacted']));
  call(context, 'setupInstantDashboardRefresh()');
  const first = state.triggers.slice().sort();
  call(context, 'setupInstantDashboardRefresh()');
  const second = state.triggers.slice().sort();
  check('setup installs the onChange and watchdog triggers',
    first.includes('dashOnSourceChange') && first.includes('dashWatchdog'),
    JSON.stringify(first));
  check('re-running setup does not stack duplicate triggers',
    JSON.stringify(first) === JSON.stringify(second), JSON.stringify(second));
}

// 11. An empty sheet must not crash the fingerprint
{
  const { context, state } = buildContext(makeSheet([]));
  let threw = false;
  try { call(context, 'dashWatchdog()'); } catch (e) { threw = true; }
  check('an empty source sheet does not crash the trigger', !threw, 'it threw');
}

// ---- Summary -------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length) {
  process.stdout.write(`\nFAILED:\n${failed.map((f) => ' - ' + f.name).join('\n')}\n`);
}
process.exit(failed.length ? 1 : 0);
