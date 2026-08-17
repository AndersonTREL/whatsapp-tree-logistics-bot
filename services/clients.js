/**
 * The two contracts the bot serves, and the questions each one asks.
 *
 * WHY THIS EXISTS
 * The bot used to serve Amazon DSP only, so "station" meant DBE2 or DBE3 and
 * every follow-up question assumed delivery work. VOI is a different client with
 * its own cities and its own kit, so the station column now carries both and the
 * conversation adapts.
 *
 * HOW THE STATION CELL IS WRITTEN (column D — this is the contract with the
 * console, the daily email and dashboard.gs, all of which group by it):
 *
 *   Amazon DSP -> "DBE2" / "DBE3"      unchanged, so all 583 historical rows and
 *                                      every existing filter keep working
 *   VOI        -> "VOI Berlin"         the word VOI, then the city
 *
 * Anything starting "DBE" is Amazon; anything starting "VOI" is VOI. No new
 * column, so the bot still owns exactly A-H and nothing in the office range moves.
 */

// ---------------------------------------------------------------- clients

const AMAZON_STATIONS = ['DBE2', 'DBE3'];

/**
 * VOI cities. Unknown cities are still accepted (title-cased) so opening a new
 * city does not need a deploy — this list exists to correct typos and casing on
 * the ones we already run.
 */
const VOI_CITIES = ['Berlin', 'Hamburg', 'Kiel', 'Flensburg', 'Rostock', 'Schwerin'];

/**
 * The examples offered when asking a driver what they need.
 *
 * Shared by both contracts on purpose. Three of the four are payroll, documents
 * and vacation, which apply to anyone on the payroll regardless of who they
 * drive for. A client can override `examples` and `closing` below if the two ever
 * need to diverge; today neither does.
 */
const SHARED_EXAMPLES = [
  'I need login details for Emietarbeiter',
  'I need Lohnabrechnung for this month',
  'My scanner has some issues with GPS',
  'Can I request vacation from X date to X date?'
];

const SHARED_CLOSING = 'Everything that is not an on-the-road issue, you can request here.';

/**
 * How a driver gets a physical replacement. This genuinely differs: Amazon
 * drivers collect from the office, VOI drivers go through their Team Leader or
 * Lead Driver. Telling a VOI driver to come to the office would send them to the
 * wrong place, so this is per contract even though the questions are shared.
 */
const REPLACEMENT_INSTRUCTIONS = {
  amazon: "Please come to the office tomorrow to get a new scanner. We'll have one ready for you.",
  voi: 'Please contact your Team Leader / Lead Driver — they will arrange the replacement with you.'
};

const CLIENTS = {
  amazon: {
    key: 'amazon',
    label: 'Amazon DSP',
    /** What to call the location when asking for it. */
    locationNoun: 'station',
    /** Shown when the bot asks who the driver is. */
    locationHint: 'DBE2 or DBE3',
    replacementInstruction: REPLACEMENT_INSTRUCTIONS.amazon
  },

  voi: {
    key: 'voi',
    label: 'VOI',
    locationNoun: 'city',
    locationHint: VOI_CITIES.slice(0, 3).join(', ') + '…',
    replacementInstruction: REPLACEMENT_INSTRUCTIONS.voi
  }
};

// ---------------------------------------------------------------- helpers

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, function (m, sep, ch) { return sep + ch.toUpperCase(); });
}

/** Edit distance, capped — only used to forgive a single typo in a city name. */
function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }

  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Canonical VOI city. Known cities are corrected for casing and a single typo;
 * anything else is accepted as typed (title-cased) so a new city just works.
 */
function canonicalCity(value) {
  const cleaned = String(value || '').trim().replace(/[.,;:]$/, '');
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();

  for (const city of VOI_CITIES) {
    if (city.toLowerCase() === lower) return city;
  }
  // Only forgive typos on words long enough for it to be unambiguous.
  if (cleaned.length >= 5) {
    for (const city of VOI_CITIES) {
      if (withinOneEdit(lower, city.toLowerCase())) return city;
    }
  }

  return titleCase(cleaned);
}

function isAmazonStationToken(word) {
  return /^(DBE2|DBE3)[.,;:]?$/i.test(word);
}

function isVoiToken(word) {
  return /^(VOI|VOI'?S)[.,;:]?$/i.test(word);
}

/** Anything that is obviously not part of a person's name. */
function looksLikeNoise(word) {
  return /^(from|at|in|the|team|city|station|-|–|,)$/i.test(word);
}

// ---------------------------------------------------------------- parsing

/**
 * Reads the client and location out of what the driver typed.
 *
 * @returns {null | {
 *   client: string, location: string|null, station: string|null,
 *   usedIndexes: number[], needsCity: boolean
 * }}
 */
function detectClient(words) {
  const amazonIndex = words.findIndex(isAmazonStationToken);
  if (amazonIndex !== -1) {
    const station = words[amazonIndex].toUpperCase().replace(/[^A-Z0-9]/g, '');
    return {
      client: 'amazon',
      location: station,
      station: station,
      usedIndexes: [amazonIndex],
      needsCity: false
    };
  }

  const voiIndex = words.findIndex(isVoiToken);
  if (voiIndex === -1) return null;

  // The city is usually right after VOI, but drivers also write "Berlin VOI".
  const candidates = [voiIndex + 1, voiIndex - 1];
  for (const index of candidates) {
    if (index < 0 || index >= words.length) continue;
    const word = words[index];
    if (isVoiToken(word) || isAmazonStationToken(word) || looksLikeNoise(word)) continue;
    if (!/^\p{L}[\p{L}\-']*$/u.test(word)) continue;

    // A known city is unambiguous. An unknown word next to VOI is only treated as
    // a city when there are still two words left over for the driver's name.
    const city = canonicalCity(word);
    const isKnown = VOI_CITIES.indexOf(city) !== -1;
    const remaining = words.length - 2;

    if (isKnown || remaining >= 2) {
      return {
        client: 'voi',
        location: city,
        station: 'VOI ' + city,
        usedIndexes: [voiIndex, index],
        needsCity: false
      };
    }
  }

  // VOI, but we could not find a city in the same message.
  return {
    client: 'voi',
    location: null,
    station: null,
    usedIndexes: [voiIndex],
    needsCity: true
  };
}

/** The client a station cell belongs to, for reading rows back. */
function clientOfStation(station) {
  const value = String(station || '').trim().toUpperCase();
  if (value.startsWith('VOI')) return 'voi';
  if (value.startsWith('DBE')) return 'amazon';
  return null;
}

function clientConfig(key) {
  const config = CLIENTS[key] || CLIENTS.amazon;

  // Shared unless a client explicitly overrides them.
  return Object.assign({
    examples: SHARED_EXAMPLES,
    closing: SHARED_CLOSING,
    replacementInstruction: REPLACEMENT_INSTRUCTIONS.amazon
  }, config);
}

module.exports = {
  CLIENTS,
  SHARED_EXAMPLES,
  SHARED_CLOSING,
  REPLACEMENT_INSTRUCTIONS,
  AMAZON_STATIONS,
  VOI_CITIES,
  canonicalCity,
  detectClient,
  clientOfStation,
  clientConfig,
  titleCase,
  isVoiToken,
  isAmazonStationToken
};
