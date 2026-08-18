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

/**
 * Anything that looks like somebody reaching for an Amazon station, including
 * the malformed spellings: "DBE", "DBE 3", "DBE-3", "DBE5".
 *
 * This matters because DBE2 and DBE3 are BERLIN stations. An Amazon driver who
 * writes "DBE 3 Berlin" must never be read as VOI just because the station was
 * typed with a space — the city alone is not evidence of the contract.
 */
function hasAmazonHint(word) {
  return /^DBE[\s.-]*\d*[.,;:]?$/i.test(String(word || '').trim());
}

/**
 * Joins a station that the driver split across two words, so "DBE 3" reads the
 * same as "DBE3". Returns tokens carrying the original indexes, so the driver's
 * name is still assembled from exactly the words we did not consume.
 */
function mergeStationTokens(words) {
  const tokens = [];

  for (let i = 0; i < words.length; i++) {
    const current = String(words[i]);
    const next = i + 1 < words.length ? String(words[i + 1]) : '';

    // "DBE" followed by a bare 2 or 3.
    if (/^DBE[.-]?$/i.test(current) && /^[23][.,;:]?$/.test(next)) {
      tokens.push({ text: 'DBE' + next.replace(/\D/g, ''), indexes: [i, i + 1] });
      i++;
      continue;
    }

    // "DBE-3" / "DBE.3" as one word.
    tokens.push({ text: current.replace(/^(DBE)[.-](\d)$/i, '$1$2'), indexes: [i] });
  }

  return tokens;
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
  // "DBE 3" and "DBE-3" mean the same as "DBE3".
  const tokens = mergeStationTokens(words);

  const amazonToken = tokens.find(function (t) { return isAmazonStationToken(t.text); });
  if (amazonToken) {
    const station = amazonToken.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const used = amazonToken.indexes.slice();

    // DBE2 and DBE3 are Berlin stations, so an Amazon driver may well add
    // "Berlin". Consume it rather than leaving it stuck on the end of their
    // surname — but only while two words remain for the actual name.
    const cityIndex = words.findIndex(function (w, i) {
      if (used.indexOf(i) !== -1) return false;
      const bare = String(w).replace(/[.,;:]$/, '').toLowerCase();
      return VOI_CITIES.some(function (c) { return c.toLowerCase() === bare; });
    });
    if (cityIndex !== -1 && words.length - used.length - 1 >= 2) used.push(cityIndex);

    return {
      client: 'amazon',
      location: station,
      station: station,
      usedIndexes: used,
      needsCity: false
    };
  }

  const voiIndex = words.findIndex(isVoiToken);

  if (voiIndex === -1) {
    // Someone reaching for a station but not landing on one — "DBE", "DBE 5".
    // Guessing VOI off a city here is how an Amazon driver at a Berlin station
    // ends up filed under the wrong contract. Ask instead.
    if (tokens.some(function (t) { return hasAmazonHint(t.text); })) {
      return { client: null, station: null, usedIndexes: [], needsCity: false, unclearStation: true };
    }

    return detectCityOnly(words);
  }

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

/**
 * A VOI driver who named their city without writing "VOI".
 *
 * This is the normal case: drivers are asked where they work, not which contract
 * they are on, so a VOI driver answers "Marta Kowalska Berlin". Only an exact
 * match against a city we run counts here — fuzzy matching is reserved for when
 * the driver wrote VOI explicitly, because without that word a near-miss is far
 * more likely to be somebody's surname than a typo.
 */
function detectCityOnly(words) {
  for (let i = 0; i < words.length; i++) {
    const bare = words[i].replace(/[.,;:]$/, '');
    const city = VOI_CITIES.find(function (c) { return c.toLowerCase() === bare.toLowerCase(); });
    if (!city) continue;

    // "Berlin" on its own is not a driver identifying themselves.
    if (words.length - 1 < 1) continue;

    return {
      client: 'voi',
      location: city,
      station: 'VOI ' + city,
      usedIndexes: [i],
      needsCity: false
    };
  }
  return null;
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
  detectCityOnly,
  hasAmazonHint,
  mergeStationTokens,
  clientOfStation,
  clientConfig,
  titleCase,
  isVoiToken,
  isAmazonStationToken
};
