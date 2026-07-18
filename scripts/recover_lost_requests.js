#!/usr/bin/env node
/**
 * Recover driver requests that were confirmed to the driver but never made it
 * into the Google Sheet.
 *
 * Two historical bugs caused this:
 *   1. values.append ran in OVERWRITE mode, so new rows could destroy older ones.
 *   2. A failed Sheets write returned success anyway, handing the driver a
 *      Request ID for a row that was never created.
 *
 * In BOTH cases the bot replied "🆔 Request ID: REQ-...". Twilio still has that
 * outbound message, so any confirmed Request ID that is missing from column F of
 * the sheet is a lost request.
 *
 * USAGE (report only - never writes to the sheet):
 *   railway run node scripts/recover_lost_requests.js --since 2026-01-01
 *
 * That produces recovery-report.json. Review it, delete any entries you do NOT
 * want restored, then backfill the rest:
 *
 *   railway run node scripts/recover_lost_requests.js --apply recovery-report.json
 *
 * Running via `railway run` reuses the credentials already configured in Railway,
 * so no keys need to be copied anywhere.
 *
 * Required env vars (all already set in Railway):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
 *   GOOGLE_SHEET_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON (or ..._CREDENTIALS)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const googleSheets = require('../services/googleSheets');

const REQUEST_ID_PATTERN = /Request ID:\s*(REQ-[\w-]+)/i;
const OUTPUT_FILE = path.join(process.cwd(), 'recovery-report.json');

// ---------------------------------------------------------------- arg parsing

function parseArgs(argv) {
  const args = { since: null, apply: null, limit: 5000 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--since') args.since = argv[++i];
    else if (argv[i] === '--apply') args.apply = argv[++i];
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

// ------------------------------------------------------- driver info parsing
// Mirrors parseDriverInfo() in server.js so recovered rows match live ones.

function parseDriverInfo(message) {
  const words = String(message || '').trim().split(/\s+/);
  if (words.length < 3) return null;

  const stationIndex = words.findIndex(w => ['DBE2', 'DBE3'].includes(w.toUpperCase()));
  if (stationIndex < 1) return null; // station must not be the first word

  return {
    firstName: words[0],
    lastName: words.slice(1, stationIndex).join(' '),
    station: words[stationIndex].toUpperCase(),
  };
}

// ------------------------------------------------------------ twilio fetching

async function fetchMessages(client, whatsappNumber, since, limit) {
  const options = { limit };
  if (since) options.dateSentAfter = new Date(since);

  console.log(`📞 Fetching Twilio message history${since ? ` since ${since}` : ''}...`);
  const all = await client.messages.list(options);

  const inbound = [];
  const outbound = [];
  for (const m of all) {
    // Only WhatsApp traffic on our number
    if (!String(m.from).startsWith('whatsapp:') && !String(m.to).startsWith('whatsapp:')) continue;
    const record = {
      sid: m.sid,
      from: m.from,
      to: m.to,
      body: m.body || '',
      date: m.dateSent || m.dateCreated,
    };
    if (String(m.from) === String(whatsappNumber)) outbound.push(record);
    else inbound.push(record);
  }

  console.log(`   ${inbound.length} inbound, ${outbound.length} outbound messages`);
  return { inbound, outbound };
}

// -------------------------------------------------------------- reconcilation

function findConfirmations(outbound) {
  const confirmations = [];
  for (const msg of outbound) {
    const match = msg.body.match(REQUEST_ID_PATTERN);
    if (match) {
      confirmations.push({ requestId: match[1], phoneNumber: msg.to, confirmedAt: msg.date });
    }
  }
  return confirmations;
}

/**
 * Reconstruct what the driver actually asked for. The request text is the last
 * inbound message from that number before the confirmation; the name/station
 * line is the most recent inbound before that which parses as driver info.
 */
function reconstructRequest(confirmation, inboundByPhone) {
  const messages = (inboundByPhone[confirmation.phoneNumber] || [])
    .filter(m => new Date(m.date) <= new Date(confirmation.confirmedAt))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (messages.length === 0) return null;

  const requestMsg = messages[messages.length - 1];

  let driverInfo = null;
  for (let i = messages.length - 2; i >= 0 && !driverInfo; i--) {
    driverInfo = parseDriverInfo(messages[i].body);
  }

  return {
    requestId: confirmation.requestId,
    phoneNumber: confirmation.phoneNumber,
    confirmedAt: confirmation.confirmedAt,
    request: requestMsg.body,
    firstName: driverInfo?.firstName || '',
    lastName: driverInfo?.lastName || '',
    station: driverInfo?.station || '',
    // Flag anything a human needs to look at before it goes into the sheet
    needsReview: !driverInfo,
  };
}

function formatTimestamp(date) {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

// ------------------------------------------------------------------ reporting

async function runReport(args) {
  const twilio = require('twilio');
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    throw new Error('Missing Twilio env vars. Run this with `railway run` so the deployed credentials are used.');
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const { inbound, outbound } = await fetchMessages(client, TWILIO_WHATSAPP_NUMBER, args.since, args.limit);

  const confirmations = findConfirmations(outbound);
  console.log(`🆔 ${confirmations.length} Request IDs were confirmed to drivers`);

  console.log('📊 Reading Request IDs already in the sheet...');
  const existing = await googleSheets.getAllRequests();
  const existingIds = new Set(existing.map(r => String(r.rowId).trim()).filter(Boolean));
  console.log(`   ${existingIds.size} Request IDs currently in column F`);

  const inboundByPhone = {};
  for (const m of inbound) {
    (inboundByPhone[m.from] = inboundByPhone[m.from] || []).push(m);
  }

  const lost = [];
  for (const confirmation of confirmations) {
    if (existingIds.has(confirmation.requestId)) continue;
    const rebuilt = reconstructRequest(confirmation, inboundByPhone);
    if (rebuilt) lost.push(rebuilt);
    else lost.push({ ...confirmation, request: '', needsReview: true, note: 'No inbound messages found for this number' });
  }

  lost.sort((a, b) => new Date(a.confirmedAt) - new Date(b.confirmedAt));

  const report = {
    generatedAt: new Date().toISOString(),
    since: args.since || 'all available history',
    confirmedToDrivers: confirmations.length,
    presentInSheet: confirmations.length - lost.length,
    lost: lost.length,
    needingManualReview: lost.filter(r => r.needsReview).length,
    requests: lost,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(58));
  console.log(`  Confirmed to drivers : ${report.confirmedToDrivers}`);
  console.log(`  Found in sheet       : ${report.presentInSheet}`);
  console.log(`  LOST                 : ${report.lost}`);
  console.log(`  Need manual review   : ${report.needingManualReview}`);
  console.log('='.repeat(58));

  if (lost.length > 0) {
    console.log('\nLost requests:\n');
    for (const r of lost) {
      const who = r.firstName ? `${r.firstName} ${r.lastName} (${r.station})` : '⚠️ NAME UNKNOWN';
      console.log(`  ${formatTimestamp(r.confirmedAt)}  ${who}  ${r.phoneNumber}`);
      console.log(`    ${String(r.request).replace(/\s+/g, ' ').slice(0, 100)}${r.request.length > 100 ? '…' : ''}\n`);
    }
    console.log(`Full report written to ${OUTPUT_FILE}`);
    console.log('Review it, remove anything you do not want restored, then run:');
    console.log(`  railway run node scripts/recover_lost_requests.js --apply ${path.basename(OUTPUT_FILE)}`);
  } else {
    console.log('\n✅ Nothing lost in this window.');
  }
}

// -------------------------------------------------------------------- backfill

async function runApply(file) {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const requests = report.requests || [];

  const incomplete = requests.filter(r => !r.firstName || !r.station);
  if (incomplete.length > 0) {
    console.error(`❌ ${incomplete.length} entries are missing a name or station.`);
    console.error('   Fill them in (or delete them) in the report file, then re-run.');
    incomplete.slice(0, 10).forEach(r => console.error(`   - ${r.requestId} ${r.phoneNumber}`));
    process.exit(1);
  }

  console.log(`📥 Restoring ${requests.length} requests to the sheet...\n`);
  let restored = 0, skipped = 0, failed = 0;

  for (const r of requests) {
    // addRequest verifies the write, so a success here means it really landed
    try {
      const already = await googleSheets.findRowByRequestId(r.requestId);
      if (already) {
        console.log(`  ⏭  ${r.requestId} already at row ${already}`);
        skipped++;
        continue;
      }

      await googleSheets.addRequest({
        timestamp: formatTimestamp(r.confirmedAt),
        firstName: r.firstName,
        lastName: r.lastName,
        station: r.station,
        phoneNumber: r.phoneNumber,
        request: r.request,
        status: 'To be contacted', // these were never actioned - surface them
        rowId: r.requestId,
      });

      console.log(`  ✅ ${r.requestId}  ${r.firstName} ${r.lastName}`);
      restored++;
    } catch (error) {
      console.error(`  ❌ ${r.requestId} failed: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nRestored ${restored}, skipped ${skipped}, failed ${failed}.`);
  if (restored > 0) {
    console.log('Recovered rows are marked "To be contacted" so they show up in the daily report.');
  }
}

// ------------------------------------------------------------------------ main

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv);
    try {
      if (args.apply) await runApply(args.apply);
      else await runReport(args);
    } catch (error) {
      console.error('\n❌ ' + error.message);
      process.exit(1);
    }
  })();
}

module.exports = { parseDriverInfo, findConfirmations, reconstructRequest, formatTimestamp };
