# Driver Requests Console

A web console over the `Driver Requests` sheet — the triage queue, request detail
and dashboard from the design handoff.

Runs as its **own service**, separate from the WhatsApp bot. It shares only the
spreadsheet and the service-account credentials, so a fault here cannot take down
the driver-facing webhook.

**Live:** <https://driver-requests-console-production.up.railway.app>

The dashboard opens for anyone with that link. The Inbox asks for the shared team
code (Railway service `driver-requests-console` -> Variables -> `CONSOLE_ACCESS_CODE`).

## Try it without touching the real sheet

```bash
npm --prefix console install
npm --prefix console run demo
```

Opens on <http://localhost:4100> with an in-memory sheet and the access code
`demo`. Triage changes and activity notes all work; nothing leaves the process.

## Running against the real sheet

```bash
CONSOLE_ACCESS_CODE=... GOOGLE_SHEET_ID=... GOOGLE_APPLICATION_CREDENTIALS_JSON=... \
  npm --prefix console start
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `CONSOLE_ACCESS_CODE` | yes | Shared code the teams enter once per browser. The server refuses to start without it. |
| `GOOGLE_SHEET_ID` | yes | Same spreadsheet the bot writes to. |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | yes | Same service-account JSON the bot uses. |
| `CONSOLE_PUBLIC_DASHBOARD` | no (`true`) | Dashboard readable without the code. Aggregates only — no names, phones or request text. |
| `CONSOLE_OPEN` | no (`false`) | `true` removes the access gate entirely. See the warning below. |
| `CONSOLE_SHEET_NAME` | no (`Driver Requests`) | Source tab. |
| `CONSOLE_ACTIVITY_SHEET` | no (`Activity Log`) | Append-only log tab, created on first use. |

### Access model

The Inbox shows unedited driver messages — names, phone numbers, and the IBANs
the bot explicitly asks drivers to send — and it can write to the sheet. It is
therefore behind one shared code, which suits shared dispatcher terminals better
than per-person accounts. Inside, each person picks who they are so activity
entries are attributable; the roster lives in `lib/owners.js`.

The Dashboard is aggregate numbers only and can be left on an open link. When a
viewer is not authenticated, the "Needs attention" table drops the request text.

`CONSOLE_OPEN=true` exists so the choice is deliberate rather than accidental.
With it set, anyone holding the URL can read driver IBANs and change triage state.

## How it is deployed

Railway project `thorough-dream`, service **`driver-requests-console`**, alongside
the bot rather than inside it — a fault here cannot take down the driver webhook.

- Root directory `console`, start command `npm start`, healthcheck `/health`
- `GOOGLE_SHEET_ID` and `GOOGLE_APPLICATION_CREDENTIALS_JSON` are Railway
  **reference variables** pointing at the bot service, so the credentials live in
  exactly one place and rotating them there covers both services
- `GET /health` reports the version and whether the gate and public dashboard are on

The bot service was left untouched.

## What it writes, and what it will not

The client's hard constraint is that no existing data is deleted or adjusted, so
it is enforced in code rather than by convention — `assertWritable()` in
`lib/sheets.js` throws on any attempt to touch columns A–G, and the test suite
asserts it for every one of them.

| Columns | Owner | Console |
| --- | --- | --- |
| A–G (timestamp, name, station, request text, request ID, phone) | the bot | never written |
| H (Status) | the bot's dropdown | written, only to the five exact dropdown values |
| Owner, Priority, Category, DA Contacted, Action, Notes | the office | written |
| Completed At | `dashboard.gs` | read only |
| `Activity Log` tab | the console | appended only, never edited or deleted |

Two details that matter more than they look:

- **Rows are found by Request ID in column F, freshly, on every write.** Never by
  a cached row index — the bot appends rows while the console is open, and anyone
  sorting the sheet would otherwise send a write to the wrong driver.
- **Office columns are resolved by header name, not fixed letters.** `dashboard.gs`
  appends `Completed At` wherever the sheet happens to end, so hardcoding I–N
  would eventually write Priority into the Notes column. Missing columns are
  created after the last used one; nothing existing shifts.

## The roster

`lib/owners.js` holds two separate lists, and keeping them apart is what protects
the history:

- **Assignable** — the current roster, grouped by team. The only values the
  console writes into Owner.
- **Legacy** — owner values already in the sheet (Amnery, Hugo, Adnan, and the
  team-level `Dispatcher DBE2/DBE3`, `Auto Team`). Never offered for new work,
  but kept so historical rows still render and the dashboard can still account
  for several hundred completed requests.

Short first-name owners already in the sheet (`Boris`, `Sam`, `Fadi`) are mapped
to their full roster names **for display and grouping only** — without that the
dashboard shows "Boris" and "Boris Toma" as two people with split workloads. The
stored cell value is never rewritten.

Maen Alkhateeb is in both Auto Team and Recruiting Team, so he appears under
both; Auto Team is his primary for grouping.

## Tests

```bash
npm --prefix console test
```

76 checks, all against an in-memory sheet — nothing touches the production
spreadsheet. They cover the day-first timestamp parsing, the filters, duplicate
detection, the dashboard maths, the access gate, and every safety rule above.

Note `parseSheetTimestamp`: the sheet's format is `DD/MM/YYYY, HH:mm:ss` and must
never go through `new Date()`, which reads it month-first. Getting that wrong
makes every age, the whole aging breakdown and the SLA column silently wrong for
the first twelve days of each month.
