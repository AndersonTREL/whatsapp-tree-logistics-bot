/**
 * Conversation-flow harness for the Tree Logistics WhatsApp bot.
 *
 * Stubs the Google Sheets service BEFORE requiring server.js, so every scenario
 * runs against the real webhook handler without touching the production sheet.
 *
 * Run:  node flow_test.js            (from the repo root, via PROJECT env var)
 */

const path = require('path');

const PROJECT = process.env.PROJECT || path.join(__dirname, '..');

// Keep the real .env out of it — the stub means no credentials are needed.
process.env.PORT = process.env.TEST_PORT || '38217';
process.env.GOOGLE_SHEET_ID = 'STUB-SHEET';
process.env.TWILIO_ACCOUNT_SID = 'ACstub';
process.env.TWILIO_AUTH_TOKEN = 'stubtoken';
process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+10000000000';

// ---- Stub googleapis so the real (very slow to load) SDK never gets required.
// Every Sheets call is stubbed below, so nothing here is ever exercised. ----
const googleapisPath = require.resolve('googleapis', { paths: [PROJECT] });
require.cache[googleapisPath] = {
  id: googleapisPath,
  filename: googleapisPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {
    google: {
      auth: { GoogleAuth: class { async getClient() { return {}; } } },
      sheets: () => ({ spreadsheets: { values: {} } }),
    },
  },
};

// ---- Stub Google Sheets before server.js captures the singleton ----
const googleSheets = require(path.join(PROJECT, 'services/googleSheets'));

const saved = [];
let failNextSaves = 0;

googleSheets.addRequest = async (requestData) => {
  if (failNextSaves > 0) {
    failNextSaves--;
    throw new Error('stubbed sheets failure');
  }
  saved.push(requestData);
  return { success: true, rowId: requestData.rowId, row: saved.length + 1 };
};
googleSheets.getRequestsByPhoneNumber = async () => [];
googleSheets.getAllRequests = async () => [];

// Silence the bot's very chatty logging unless DEBUG=1
if (!process.env.DEBUG) {
  const noop = () => {};
  console.log = noop;
  console.warn = noop;
}

require(path.join(PROJECT, 'server.js'));

const BASE = `http://127.0.0.1:${process.env.PORT}`;

// ---- helpers ----
async function send(from, body, profileName = 'Tester') {
  const params = new URLSearchParams({
    Body: body,
    From: from,
    ProfileName: profileName,
    MessageSid: 'SM' + Math.random().toString(16).slice(2),
    AccountSid: 'ACstub',
    To: 'whatsapp:+10000000000',
  });

  const res = await fetch(`${BASE}/webhook/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const xml = await res.text();
  const match = xml.match(/<Message>([\s\S]*)<\/Message>/);
  return { status: res.status, text: match ? match[1] : xml };
}

async function clearFlows() {
  await fetch(`${BASE}/clear-flows`, { method: 'POST' });
}

// ---- assertions ----
const results = [];
function check(name, condition, detail = '') {
  results.push({ name, pass: !!condition, detail });
  const mark = condition ? '✅' : '❌';
  process.stdout.write(`${mark} ${name}${condition ? '' : '\n     ' + detail}\n`);
}

const REPLY = {
  welcome: /Welcome to Tree Logistics/i,
  // Re-prompt for identification: either the old "correct format" wording or the
  // newer message that names the missing piece.
  askAgain: /correct format|we still need|we also need/i,
  askRequest: /what you need help with/i,
  submitted: /submitted successfully/i,
  notSaved: /could NOT be saved/i,
};

let phoneSeq = 0;
const nextPhone = () => `whatsapp:+4915${String(1000000 + ++phoneSeq)}`;

async function main() {
  await new Promise((r) => setTimeout(r, 400)); // let the server bind

  // === Scenario 1: the documented happy path ===
  {
    const p = nextPhone();
    const r1 = await send(p, 'Hi');
    check('S1 greeting gets the welcome', REPLY.welcome.test(r1.text), r1.text);

    const r2 = await send(p, 'John Smith DBE2');
    check('S1 name+station is accepted', REPLY.askRequest.test(r2.text), r2.text);

    const before = saved.length;
    const r3 = await send(p, 'I need my Lohnabrechnung for July please');
    check('S1 request is confirmed', REPLY.submitted.test(r3.text), r3.text);
    check('S1 request reached the sheet', saved.length === before + 1,
      `saved went ${before} -> ${saved.length}`);
    if (saved.length > before) {
      const row = saved[saved.length - 1];
      check('S1 row has the right name/station',
        row.firstName === 'John' && row.lastName === 'Smith' && row.station === 'DBE2',
        JSON.stringify(row));
      check('S1 row keeps the full request text',
        /Lohnabrechnung for July/.test(row.request), row.request);
      check('S1 row is marked open for the office',
        row.status === 'To be contacted', String(row.status));
    }
  }

  // === Scenario 2: driver leads with the actual request ===
  {
    const p = nextPhone();
    const opening = 'I need a new scanner because mine is broken since yesterday';
    await send(p, opening);
    const r2 = await send(p, 'Maria Garcia DBE3');

    const landed = saved.find((s) => s.phoneNumber === p);
    check('S2 opening request is not thrown away',
      !!landed && /scanner/i.test(landed.request || ''),
      landed ? landed.request : `no row saved; reply was: ${r2.text}`);
  }

  // === Scenario 3: restart mid-conversation must not swallow the request ===
  {
    const p = nextPhone();
    await send(p, 'Hello');
    await send(p, 'Ahmed Hassan DBE2');
    await clearFlows(); // simulates a Railway restart wiping in-memory state

    // The driver now sends the request into a bot that has forgotten them.
    await send(p, 'I need login details for Emietarbeiter please');
    // They re-identify themselves and the held request must be submitted.
    await send(p, 'Ahmed Hassan DBE2');

    const landed = saved.find((s) => s.phoneNumber === p);
    check('S3 request sent during a restart still reaches the sheet',
      !!landed && /Emietarbeiter/i.test(landed.request || ''),
      landed ? landed.request : `nothing saved for ${p}`);
  }

  // === Scenario 4: station written first / name order variations ===
  {
    for (const [label, msg, expect] of [
      ['station last', 'Peter Klein DBE3', { firstName: 'Peter', lastName: 'Klein', station: 'DBE3' }],
      ['station first', 'DBE2 Anna Vogel', { firstName: 'Anna', lastName: 'Vogel', station: 'DBE2' }],
      ['station middle', 'Luis DBE3 Ferreira', { firstName: 'Luis', lastName: 'Ferreira', station: 'DBE3' }],
      ['lowercase station', 'Nina Braun dbe2', { firstName: 'Nina', lastName: 'Braun', station: 'DBE2' }],
    ]) {
      const p = nextPhone();
      await send(p, 'Hi');
      const r = await send(p, msg);
      const accepted = REPLY.askRequest.test(r.text);
      if (!accepted) {
        check(`S4 ${label} accepted`, false, r.text);
        continue;
      }
      await send(p, 'I have a question about my payslip amount this month');
      const row = saved.find((s) => s.phoneNumber === p);
      check(`S4 ${label} parsed correctly`,
        row && row.firstName === expect.firstName && row.lastName === expect.lastName &&
        row.station === expect.station,
        row ? JSON.stringify({ f: row.firstName, l: row.lastName, s: row.station }) : 'not saved');
    }
  }

  // === Scenario 5: no station given ===
  {
    const p = nextPhone();
    await send(p, 'Hi');
    const r = await send(p, 'Thomas Berger');
    check('S5 missing station is re-asked, not accepted',
      REPLY.askAgain.test(r.text) && !REPLY.askRequest.test(r.text), r.text);

    // Missing surname must be re-asked too, and say so.
    const p2 = nextPhone();
    await send(p2, 'Hi');
    const r2 = await send(p2, 'Thomas DBE2');
    check('S5 missing last name is re-asked',
      REPLY.askAgain.test(r2.text) && !REPLY.askRequest.test(r2.text), r2.text);
  }

  // === Scenario 6: the scanner follow-up keeps both messages ===
  {
    const p = nextPhone();
    await send(p, 'Hi');
    await send(p, 'Omar Farouk DBE3');
    await send(p, 'I need a scanner');          // triggers the status follow-up
    await send(p, 'it is broken completely');   // accepted on retry

    const row = saved.find((s) => s.phoneNumber === p);
    check('S6 follow-up keeps the original request text',
      row && /scanner/i.test(row.request) && /broken/i.test(row.request),
      row ? row.request : 'not saved');
  }

  // === Scenario 7: a sheet failure must NOT tell the driver it worked ===
  {
    const p = nextPhone();
    await send(p, 'Hi');
    await send(p, 'Sara Lopez DBE2');
    failNextSaves = 1;
    const r = await send(p, 'I need a confirmation letter for my landlord');
    check('S7 driver is told the truth when the sheet write fails',
      REPLY.notSaved.test(r.text) && !REPLY.submitted.test(r.text), r.text);

    // and a retry should then succeed without losing the request
    const r2 = await send(p, 'I need a confirmation letter for my landlord');
    const row = saved.find((s) => s.phoneNumber === p);
    check('S7 retry after a failure lands in the sheet',
      !!row && REPLY.submitted.test(r2.text),
      row ? row.request : r2.text);
  }

  // === Scenario 8: very short request ===
  {
    const p = nextPhone();
    await send(p, 'Hi');
    await send(p, 'Nils Weber DBE3');
    await send(p, 'Payslip');            // under the 10-char floor
    const r2 = await send(p, 'Payslip'); // retry accepts
    const row = saved.find((s) => s.phoneNumber === p);
    check('S8 a short request still reaches the office within two tries',
      !!row && REPLY.submitted.test(r2.text), row ? row.request : r2.text);
  }

  // === Scenario 9: multi-line name+station (real traffic shape) ===
  {
    const p = nextPhone();
    await send(p, 'Hello');
    const r = await send(p, 'Yogeshkumar \nSavaliya \nDBE3');
    check('S9 multi-line name+station accepted', REPLY.askRequest.test(r.text), r.text);
    await send(p, 'I need the Arbeitsvertrag confirmation for my visa application');
    const row = saved.find((s) => s.phoneNumber === p);
    check('S9 multi-line driver request saved',
      row && row.firstName === 'Yogeshkumar' && row.lastName === 'Savaliya',
      row ? JSON.stringify({ f: row.firstName, l: row.lastName }) : 'not saved');
  }

  // === Scenario 10: a long greeting must not become the request ===
  {
    for (const opener of ['Assalamu alaikum', 'Guten Morgen 👋👋', 'Hallo!!! 😊', 'thank you']) {
      const p = nextPhone();
      await send(p, opener);
      const r = await send(p, 'Elena Petrova DBE2');
      check(`S10 "${opener}" is treated as a greeting, not a request`,
        REPLY.askRequest.test(r.text) && !REPLY.submitted.test(r.text), r.text);
    }
  }

  // === Scenario 11: name+station as the opener is not mistaken for a request ===
  {
    const p = nextPhone();
    const r = await send(p, 'Fatima Al Sayed DBE3');
    check('S11 opening with name+station asks for the request',
      REPLY.welcome.test(r.text), r.text);
    const r2 = await send(p, 'Fatima Al Sayed DBE3');
    check('S11 name+station is then accepted, not saved as a request',
      REPLY.askRequest.test(r2.text) && !REPLY.submitted.test(r2.text), r2.text);
  }

  // ---- summary ----
  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length) {
    process.stdout.write(`\nFAILED:\n${failed.map((f) => ' - ' + f.name).join('\n')}\n`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
