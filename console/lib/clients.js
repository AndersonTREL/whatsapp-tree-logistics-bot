/**
 * The contracts behind the station column.
 *
 * The bot writes column D as either "DBE2"/"DBE3" (Amazon DSP) or "VOI <City>"
 * (VOI) — see services/clients.js in the bot. That prefix is the only coupling
 * between the two services, so it is read here rather than duplicated as config.
 *
 * Deriving the client from the existing column means no schema change, and all
 * 583 historical rows classify correctly with no backfill: they all start "DBE".
 */

const AMAZON = 'amazon';
const VOI = 'voi';
const UNKNOWN = 'other';

const CLIENTS = [
  {
    key: AMAZON,
    label: 'Amazon',
    // Shown in the console's filter row.
    short: 'Amazon',
    color: '#199948',
    /** Default owner suggested for a request with nobody on it. */
    defaultOwner: null
  },
  {
    key: VOI,
    label: 'VOI',
    short: 'VOI',
    color: '#3E7BD6',
    // VOI requests come to Anderson unless someone else takes them. This is a
    // suggestion the console offers in one click, not an automatic write — a row
    // with nobody on it still counts as Unassigned, which keeps that number honest.
    defaultOwner: 'Anderson Meta'
  }
];

/** Which contract a station cell belongs to. */
function clientOf(station) {
  const value = String(station || '').trim().toUpperCase();
  if (value.startsWith('VOI')) return VOI;
  if (value.startsWith('DBE')) return AMAZON;
  return UNKNOWN;
}

/** The location within the contract: "DBE2", or "Berlin" for "VOI Berlin". */
function locationOf(station) {
  const value = String(station || '').trim();
  if (clientOf(value) === VOI) {
    const rest = value.replace(/^voi\s*/i, '').trim();
    return rest || '(no city)';
  }
  return value || '(none)';
}

function configOf(clientKey) {
  return CLIENTS.find(function (c) { return c.key === clientKey; }) || null;
}

function labelOf(clientKey) {
  const config = configOf(clientKey);
  return config ? config.label : 'Other';
}

/** Default owner for a client, or null when there is none. */
function defaultOwnerFor(clientKey) {
  const config = configOf(clientKey);
  return (config && config.defaultOwner) || null;
}

/**
 * The locations actually present in the data for a client, so the filter row
 * reflects reality rather than a hardcoded list — a new VOI city appears on its
 * own the first time a driver uses it.
 */
function locationsFor(requests, clientKey) {
  const seen = {};

  requests.forEach(function (r) {
    if (clientOf(r.station) !== clientKey) return;
    const location = locationOf(r.station);
    if (!seen[location]) seen[location] = 0;
    seen[location]++;
  });

  return Object.keys(seen).sort(function (a, b) {
    if (seen[b] !== seen[a]) return seen[b] - seen[a];
    return a.localeCompare(b);
  });
}

module.exports = {
  AMAZON,
  VOI,
  UNKNOWN,
  CLIENTS,
  clientOf,
  locationOf,
  configOf,
  labelOf,
  defaultOwnerFor,
  locationsFor
};
