/**
 * HTTP-level tests for the console server: the access gate, the actor
 * requirement for writes, what the open dashboard does and does not expose, and
 * that the driver webhook's data is never mutated outside the allowed columns.
 *
 * Runs against an in-memory sheet. Run: node console/tests/server_test.js
 */

const assert = require('assert');
const path = require('path');

const PORT = process.env.TEST_PORT || '4211';
const CODE = 'test-code-123';

process.env.CONSOLE_ACCESS_CODE = CODE;
process.env.CONSOLE_PUBLIC_DASHBOARD = 'true';
process.env.GOOGLE_SHEET_ID = 'TEST-SHEET';
process.env.PORT = PORT;

const { FakeSheets } = require('./fake_sheets');
const { SheetsClient, ACTIVITY_HEADERS } = require(path.join(__dirname, '..', 'lib', 'sheets'));

const HEADER = [
  'Timestamp', 'First Name', 'Last Name', 'Station', 'Request/Question',
  'Request ID', 'Phone Number', 'Status', 'Owner', 'Priority', 'DA Contacted',
  'Out or still with us', 'Action', 'Notes'
];

const fake = new FakeSheets({
  'Driver Requests': [
    HEADER,
    ['17/08/2026, 07:05:00', 'Yogesh', 'Savaliya', 'DBE3', 'Need my Arbeitsvertrag', 'REQ-1', 'whatsapp:+4917630672255', 'To be contacted', '', '', '', '', '', ''],
    ['01/07/2026, 08:00:00', 'Maria', 'Garcia', 'DBE2', 'IBAN change DE12 5001 0517 0648 4898 90', 'REQ-2', 'whatsapp:+4917600000002', 'Completed', 'Boris', '', '', '', '', '']
  ],
  'Activity Log': [ACTIVITY_HEADERS.slice()]
});

const server = require(path.join(__dirname, '..', 'server'));
server.repo.sheets = new SheetsClient({
  spreadsheetId: 'TEST-SHEET',
  fetchImpl: fake.fetch,
  tokenProvider: async () => 'test-token'
});
server.repo.cacheMs = 0;
server.repo.invalidate();

const BASE = 'http://127.0.0.1:' + PORT;
const results = [];

function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  process.stdout.write((cond ? '✅ ' : '❌ ') + name + (cond ? '' : '\n     ' + (detail || '')) + '\n');
}

async function call(pathname, opts) {
  const options = opts || {};
  const res = await fetch(BASE + pathname, {
    method: options.method || 'GET',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      options.cookie ? { Cookie: options.cookie } : {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* html */ }
  return { status: res.status, body: json, text, setCookie: res.headers.get('set-cookie') };
}

(async function run() {
  const listener = server.app.listen(PORT);
  await new Promise((r) => setTimeout(r, 350));

  // ---- the gate ----
  const anon = await call('/api/state');
  check('the inbox refuses anonymous callers', anon.status === 401, 'status=' + anon.status);

  const badCode = await call('/api/session', { method: 'POST', body: { code: 'wrong' } });
  check('a wrong access code is rejected', badCode.status === 401, 'status=' + badCode.status);

  const login = await call('/api/session', { method: 'POST', body: { code: CODE } });
  check('the correct access code opens a session', login.status === 200 && !!login.setCookie,
    'status=' + login.status);

  const cookie = (login.setCookie || '').split(';')[0];

  const authed = await call('/api/state', { cookie });
  check('the inbox loads once authenticated',
    authed.status === 200 && authed.body.requests.length === 2, JSON.stringify(authed.body).slice(0, 200));

  check('the roster is delivered grouped by team',
    authed.body.options.owners.some((g) => g.team === 'Dispatchers DBE3' && g.people.includes('Qays')),
    JSON.stringify(authed.body.options.owners));

  // ---- the open dashboard ----
  const dashAnon = await call('/api/dashboard');
  check('the dashboard is readable without the code', dashAnon.status === 200, 'status=' + dashAnon.status);

  check('the open dashboard exposes aggregate numbers',
    dashAnon.body.stats.kpis.total === 2, JSON.stringify(dashAnon.body.stats.kpis));

  const leaked = JSON.stringify(dashAnon.body);
  check('the open dashboard leaks no driver names, phones or request text',
    !leaked.includes('Yogesh') && !leaked.includes('4917630672255') &&
    !leaked.includes('Arbeitsvertrag') && !leaked.includes('DE12'),
    leaked.slice(0, 300));

  const dashAuthed = await call('/api/dashboard', { cookie });
  check('an authenticated dashboard does include request text for the attention table',
    JSON.stringify(dashAuthed.body).includes('Arbeitsvertrag'),
    'expected request text when authed');

  // ---- writes need an actor ----
  const noActor = await call('/api/requests/REQ-1/triage', {
    method: 'POST', cookie, body: { status: 'In Progress' }
  });
  check('a write without choosing who you are is refused',
    noActor.status === 400 && /who you are/i.test(noActor.body.error), JSON.stringify(noActor.body));
  check('nothing was written before an actor was chosen', fake.writes.length === 0,
    JSON.stringify(fake.writes));

  const badActor = await call('/api/actor', { method: 'POST', cookie, body: { name: 'Nobody At All' } });
  check('an unknown person cannot be selected as the actor', badActor.status === 400,
    'status=' + badActor.status);

  const actor = await call('/api/actor', { method: 'POST', cookie, body: { name: 'Anderson Meta' } });
  check('a roster member can be selected as the actor', actor.status === 200,
    JSON.stringify(actor.body));

  const fullCookie = cookie + '; ' + (actor.setCookie || '').split(';')[0];

  // ---- triage ----
  const triage = await call('/api/requests/REQ-1/triage', {
    method: 'POST', cookie: fullCookie, body: { status: 'In Progress', owner: 'Diana Ionita' }
  });
  check('triage succeeds with an actor', triage.status === 200 && triage.body.changed,
    JSON.stringify(triage.body));

  check('the status landed in column H', fake.writes.some((w) => w.col === 8 && w.value === 'In Progress'),
    JSON.stringify(fake.writes));
  check('the owner landed in the Owner column', fake.writes.some((w) => w.col === 9 && w.value === 'Diana Ionita'),
    JSON.stringify(fake.writes));
  check('no bot-owned column A–G was written', fake.botColumnWrites().length === 0,
    JSON.stringify(fake.botColumnWrites()));

  check('both changes were logged with the actor and team',
    fake.appends.filter((a) => a.sheet === 'Activity Log' && a.row[2] === 'Anderson Meta' && a.row[3] === 'Admin').length === 2,
    JSON.stringify(fake.appends));

  const badStatus = await call('/api/requests/REQ-1/triage', {
    method: 'POST', cookie: fullCookie, body: { status: 'Finished' }
  });
  check('an off-dropdown status is rejected with 400', badStatus.status === 400,
    'status=' + badStatus.status + ' ' + JSON.stringify(badStatus.body));

  const legacyOwner = await call('/api/requests/REQ-1/triage', {
    method: 'POST', cookie: fullCookie, body: { owner: 'Amnery' }
  });
  check('a past owner cannot be assigned new work', legacyOwner.status === 400,
    'status=' + legacyOwner.status);

  const missing = await call('/api/requests/REQ-404/triage', {
    method: 'POST', cookie: fullCookie, body: { status: 'In Progress' }
  });
  check('triaging an unknown request returns 404', missing.status === 404, 'status=' + missing.status);

  // ---- activity ----
  const note = await call('/api/requests/REQ-1/activity', {
    method: 'POST', cookie: fullCookie, body: { text: 'Called the driver.' }
  });
  check('an action note is logged', note.status === 200 && note.body.changed, JSON.stringify(note.body));

  const empty = await call('/api/requests/REQ-1/activity', {
    method: 'POST', cookie: fullCookie, body: { text: '   ' }
  });
  check('an empty note is a no-op', empty.status === 200 && empty.body.changed === false,
    JSON.stringify(empty.body));

  // ---- the request itself is untouched ----
  check('the driver\'s request text is still exactly as the bot wrote it',
    fake.tabs['Driver Requests'][1][4] === 'Need my Arbeitsvertrag',
    fake.tabs['Driver Requests'][1][4]);
  check('the driver\'s phone number is unchanged',
    fake.tabs['Driver Requests'][1][6] === 'whatsapp:+4917630672255',
    fake.tabs['Driver Requests'][1][6]);

  // ---- shell ----
  const shell = await call('/');
  check('the app shell is served', shell.status === 200 && /Driver Requests/.test(shell.text),
    'status=' + shell.status);
  const health = await call('/health');
  check('health reports the gate is on', health.status === 200 && health.body.gated === true,
    JSON.stringify(health.body));

  listener.close();

  const failed = results.filter((r) => !r.pass);
  process.stdout.write('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed\n');
  if (failed.length) {
    process.stdout.write('\nFAILED:\n' + failed.map((f) => ' - ' + f.name).join('\n') + '\n');
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
