/**
 * Who works on driver requests.
 *
 * Two separate concerns live here, and keeping them apart is what protects the
 * client's hard constraint that no existing data is adjusted:
 *
 *   ASSIGNABLE   - the current roster. These are the only values the console
 *                  ever WRITES into the Owner column.
 *   LEGACY       - owner values already sitting in the sheet from before this
 *                  roster existed. Never offered for new assignment, but kept
 *                  so historical rows still render and still group correctly in
 *                  the dashboard. Nothing is rewritten to "fix" them.
 *
 * The sheet also holds short first-name owners ("Boris", "Sam", "Fadi") that
 * refer to people who are on the roster under their full name. ALIASES maps
 * those together for DISPLAY AND GROUPING ONLY - without it the dashboard shows
 * "Boris" and "Boris Toma" as two different people with split workloads. The
 * stored cell value is never changed by this mapping.
 */

// Teams in the order they should appear in pickers and on the dashboard.
const TEAMS = [
  'Dispatchers DBE2',
  'Dispatchers DBE3',
  'Auto Team',
  'Equipment Team',
  'Recruiting Team',
  'HR',
  'Admin'
];

/**
 * The roster. `teams` is an array because people really do sit in two teams -
 * Maen Alkhateeb is in both Auto Team and Recruiting Team. The first entry is
 * treated as their primary team for grouping.
 */
const PEOPLE = [
  { name: 'Florent Myftari',  teams: ['Dispatchers DBE2'] },
  { name: 'Nadir Timur',      teams: ['Dispatchers DBE2'] },
  { name: 'Luciano Tahiri',   teams: ['Dispatchers DBE2'] },

  { name: 'Diana Ionita',     teams: ['Dispatchers DBE3'] },
  // Surname not supplied in the roster; stored exactly as given.
  { name: 'Qays',             teams: ['Dispatchers DBE3'] },

  { name: 'Adil Sefer',       teams: ['Auto Team'] },
  { name: 'Mehmet Acar',      teams: ['Auto Team'] },
  { name: 'Maen Alkhateeb',   teams: ['Auto Team', 'Recruiting Team'] },
  { name: 'Samir Muranovic',  teams: ['Auto Team'] },

  { name: 'Pedro Trabbold',   teams: ['Equipment Team'] },

  { name: 'Tirth Patel',      teams: ['Recruiting Team'] },

  { name: 'Ali Butt',         teams: ['HR'] },
  { name: 'Fadi Nader',       teams: ['HR'] },

  { name: 'Boris Toma',       teams: ['Admin'] },
  { name: 'Anderson Meta',    teams: ['Admin'] },
  { name: 'Sam Jose',         teams: ['Admin'] }
];

/**
 * Owner values that exist in the sheet's history but are not on the roster.
 * `note` is shown in the UI so nobody wonders why they cannot be picked.
 *
 * Amnery, Hugo and Adnan between them own several hundred historical rows, so
 * dropping them would leave the dashboard's workload table unable to account
 * for completed work.
 */
const LEGACY_OWNERS = [
  { name: 'Amnery',          note: 'historical owner' },
  { name: 'Hugo',            note: 'historical owner' },
  { name: 'Adnan',           note: 'historical owner' },
  { name: 'Dispatcher DBE2', note: 'team-level owner, superseded by named dispatchers' },
  { name: 'Dispatcher DBE3', note: 'team-level owner, superseded by named dispatchers' },
  { name: 'Auto Team',       note: 'team-level owner, superseded by named members' }
];

/**
 * Display-and-grouping aliases: sheet value (lowercased) -> canonical roster name.
 * Includes the spelling variants already present in the sheet.
 */
const ALIASES = {
  'boris': 'Boris Toma',
  'boris toma': 'Boris Toma',
  'anderson': 'Anderson Meta',
  'anderson meta': 'Anderson Meta',
  'sam': 'Sam Jose',
  'sam jose': 'Sam Jose',
  'fadi': 'Fadi Nader',
  'fadi nader': 'Fadi Nader',
  'maen': 'Maen Alkhateeb',
  'maen alkhateeb': 'Maen Alkhateeb',
  'ali': 'Ali Butt',
  'ali butt': 'Ali Butt',
  'pedro': 'Pedro Trabbold',
  'pedro trabbold': 'Pedro Trabbold',
  'tirth': 'Tirth Patel',
  'tirth patel': 'Tirth Patel',
  'diana': 'Diana Ionita',
  'diana ionita': 'Diana Ionita',
  'florent': 'Florent Myftari',
  'florent myftari': 'Florent Myftari',
  'nadir': 'Nadir Timur',
  'nadir timur': 'Nadir Timur',
  'luciano': 'Luciano Tahiri',
  'luciano tahiri': 'Luciano Tahiri',
  'adil': 'Adil Sefer',
  'adil sefer': 'Adil Sefer',
  'mehmet': 'Mehmet Acar',
  'mehmet acar': 'Mehmet Acar',
  'samir': 'Samir Muranovic',
  'samir muranovic': 'Samir Muranovic',
  'qays': 'Qays',

  // Team-level owners, including the misspellings already in the sheet.
  'dispatcher dbe2': 'Dispatcher DBE2',
  'disaptcher dbe2': 'Dispatcher DBE2',
  'dispacher dbe2': 'Dispatcher DBE2',
  'dispatchers dbe2': 'Dispatcher DBE2',
  'dispatcher dbe3': 'Dispatcher DBE3',
  'disaptcher dbe3': 'Dispatcher DBE3',
  'dispacher dbe3': 'Dispatcher DBE3',
  'dispatchers dbe3': 'Dispatcher DBE3',
  'auto team': 'Auto Team',
  'autoteam': 'Auto Team'
};

const UNASSIGNED = 'Unassigned';

/** Every value the Owner dropdown may write, grouped by team for the picker. */
function assignableOwners() {
  return TEAMS.map(function (team) {
    return {
      team: team,
      people: PEOPLE.filter(function (p) { return p.teams.indexOf(team) !== -1; })
        .map(function (p) { return p.name; })
    };
  }).filter(function (g) { return g.people.length > 0; });
}

/** Flat list of assignable names. */
function assignableNames() {
  return PEOPLE.map(function (p) { return p.name; });
}

/**
 * Canonical form of an owner value read from the sheet, for display and
 * grouping. Unknown values are preserved verbatim (trimmed) rather than being
 * forced into the roster - an owner nobody recognises is data, not an error.
 */
function normalizeOwner(value) {
  const cleaned = String(value == null ? '' : value)
    .replace(/[  -​]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return UNASSIGNED;
  if (cleaned.toLowerCase() === 'unassigned') return UNASSIGNED;

  return ALIASES[cleaned.toLowerCase()] || cleaned;
}

/** Primary team for a canonical owner name, or null if it has none. */
function teamOf(ownerName) {
  const person = PEOPLE.find(function (p) { return p.name === ownerName; });
  if (person) return person.teams[0];

  // Team-level legacy owners map onto the closest current team.
  if (ownerName === 'Dispatcher DBE2') return 'Dispatchers DBE2';
  if (ownerName === 'Dispatcher DBE3') return 'Dispatchers DBE3';
  if (ownerName === 'Auto Team') return 'Auto Team';

  return null;
}

function isAssignable(ownerName) {
  return PEOPLE.some(function (p) { return p.name === ownerName; });
}

function isLegacy(ownerName) {
  return LEGACY_OWNERS.some(function (o) { return o.name === ownerName; });
}

/** Initials for the activity avatars, e.g. "Boris Toma" -> "BT", "Qays" -> "QA". */
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

module.exports = {
  TEAMS,
  PEOPLE,
  LEGACY_OWNERS,
  UNASSIGNED,
  assignableOwners,
  assignableNames,
  normalizeOwner,
  teamOf,
  isAssignable,
  isLegacy,
  initialsOf
};
