/**
 * Deterministic Georgian → English translation preprocessing.
 *
 * Purpose: transforms product field values and company info to English BEFORE
 * they are injected into the AI prompt. This prevents raw Georgian script from
 * leaking into English-language responses via verbatim data copying — Gemini
 * treats structured data as facts to quote, not text to translate.
 *
 * Architecture:
 *   • Word-level vocabulary table (GEO_EN) for known craft/spiritual shop terms.
 *   • Morphological suffix-stripping for inflected forms (e.g. "შივას" → "Shiva").
 *   • geoToLatin() phonetic fallback for unknown words (produces readable Latin,
 *     not raw Georgian script).
 *   • Specialized extractors for company info (address, hours) patterns.
 */

import { geoToLatin } from './productRetrieval';

// ─── Vocabulary: Georgian → English ──────────────────────────────────────────
// Keys are nominative-form Georgian words. Suffix stripping (below) handles
// inflected forms before lookup.
const GEO_EN: Record<string, string> = {
  // ── Product types ──────────────────────────────────────────────────────────
  'ქანდაკება': 'Statue',
  'ქანდაკებ':  'Statues',
  'ქანდაკები': 'Statues',
  'ტარო':      'Tarot',
  'სანთელი':   'Candle',
  'სანთლები':  'Candles',
  'ყელსაბამი': 'Necklace',
  'ბეჭედი':    'Ring',
  'ბეჭდები':   'Rings',
  'საყურე':    'Earrings',
  'სამაჯური':  'Bracelet',
  'გულსაკიდი': 'Pendant',
  'სამკაული':  'Jewel',
  'სამკაულები':'Jewelry',
  'ქვა':       'Stone',
  'ქვები':     'Stones',
  'კრისტალი':  'Crystal',
  'კრისტლები': 'Crystals',
  'ამეთვისტო': 'Amethyst',
  'კვარცი':    'Quartz',
  'ავენტური':  'Aventurine',
  'ავენტურინი':'Aventurine',
  'ლაჟვარდი':  'Lapis Lazuli',
  'ობსიდიანი': 'Obsidian',
  'აგატი':     'Agate',
  'მძივი':     'Bead',
  'მძივები':   'Beads',
  'ეთეროვანი': 'Essential',
  'ზეთი':      'Oil',
  'კმელი':     'Incense',
  'ბარათი':    'Card',
  'ბარათები':  'Cards',
  'ნაკეთობა':  'Craft',
  'ნივთი':     'Item',
  'ნივთები':   'Items',

  // ── Spiritual figures ──────────────────────────────────────────────────────
  'შივა':     'Shiva',
  'კრიშნა':   'Krishna',
  'ბუდა':     'Buddha',
  'განეში':   'Ganesh',
  'ლაქსმი':   'Lakshmi',
  'სარასვატი':'Sarasvati',
  'კალი':     'Kali',
  'ვიშნუ':    'Vishnu',
  'ტარა':     'Tara',
  'გუანიმი':  'Kuan Yin',

  // ── Colors ─────────────────────────────────────────────────────────────────
  'წითელი':       'Red',
  'ლურჯი':        'Blue',
  'მწვანე':       'Green',
  'შავი':         'Black',
  'თეთრი':        'White',
  'ვარდისფერი':   'Pink',
  'იასამნისფერი': 'Purple',
  'ყვითელი':      'Yellow',
  'ნარინჯისფერი': 'Orange',
  'მოწამლული':    'Teal',

  // ── Materials ──────────────────────────────────────────────────────────────
  'ვერცხლი': 'Silver',
  'ოქრო':    'Gold',
  'სპილენძი':'Copper',
  'ბრინჯაო': 'Bronze',
  'ხე':      'Wood',
  'კერამიკა':'Ceramic',
  'მინა':    'Glass',

  // ── Descriptors ────────────────────────────────────────────────────────────
  'შინაგანი':    'Inner',
  'სიძლიერე':   'Strength',
  'ტრანსფორმაცია':'Transformation',
  'სიყვარული':  'Love',
  'დაცვა':      'Protection',
  'ბედნიერება': 'Happiness',
  'ჰარმონია':   'Harmony',
  'ბალანსი':    'Balance',
  'ენერგია':    'Energy',
  'სიმშვიდე':  'Peace',
  'სულიერი':   'Spiritual',
  'სამკურნალო':'Healing',
  'მედიტაცია': 'Meditation',
  'ბუნებრივი': 'Natural',
  'ხელნაკეთი': 'Handmade',
  'ნამდვილი':  'Genuine',
  'დიდი':      'Large',
  'პატარა':    'Small',
  'მრგვალი':   'Round',
  'ოთხკუთხა':  'Square',
  'ნედლი':     'Raw',
  'სრული':     'Full',
  'ახალი':     'New',
  'სპეციალური':'Special',

  // ── Connectors / function words ────────────────────────────────────────────
  'და':        'and',
  'ან':        'or',

  // ── Company-info structural words ──────────────────────────────────────────
  'მისამართი': 'Address:',
  'ტელეფონი':  'Phone:',
  'მუშაობს':   'Open',
  'ყოველ':     'every',
  'დღე':       'day',
  'ყოველდღე':  'daily',

  // ── Days of the week ───────────────────────────────────────────────────────
  'ორშაბათი':  'Monday',
  'სამშაბათი': 'Tuesday',
  'ოთხშაბათი': 'Wednesday',
  'ხუთშაბათი': 'Thursday',
  'პარასკევი': 'Friday',
  'შაბათი':    'Saturday',
  'კვირა':     'Sunday',
  'კვირის':    'Sunday',
};

// Georgian morphological suffixes to strip before dictionary lookup (longest first).
// Handles inflected forms: "შივას" → strip 'ს' → "შივა" → "Shiva".
const GEO_LOOKUP_SUFFIXES = [
  'ებისთვის', 'ებიდან', 'ებამდე', 'ებისა', 'ების', 'ებში', 'ებს', 'ებად',
  'ისთვის',   'იდან',   'ამდე',   'ისა',   'ობა',  'ში',   'ით',  'ის',
  'ებ', 'ს', 'ი',
];

const GEO_SCRIPT_RE = /[\u10D0-\u10FF]/;

export function containsGeorgian(text: string): boolean {
  return GEO_SCRIPT_RE.test(text);
}

// Georgian nominative vowels stripped during stemming (Latin-comment safe constant).
const GEO_VOWELS = ['ა', 'ე', 'ი', 'ო', 'უ']; // ა ე ი ო უ

/**
 * Reduces a Georgian word to a comparable root for stem-level vocabulary lookup.
 * Removes ONE inflectional suffix if present, otherwise strips a single trailing
 * nominative vowel.  This unifies oblique/declined forms with their nominative
 * dictionary entry WITHOUT per-word or per-phrase mappings — e.g. the oblique
 * "for strength" form stems to the same root as the nominative "strength" key,
 * and "for transformation" stems to the same root as "transformation".
 *
 * Minimum-length guards keep roots >= 3 chars to avoid short-stem collisions.
 */
function geoStem(word: string): string {
  for (const suffix of GEO_LOOKUP_SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  if (word.length >= 4 && GEO_VOWELS.includes(word[word.length - 1])) {
    return word.slice(0, word.length - 1);
  }
  return word;
}

// Stem -> English index, precomputed once from the GEO_EN vocabulary.
// Lets inflected descriptor words resolve to their English meaning via
// linguistic normalization instead of phonetic transliteration.
// First entry wins on collision (dictionary is ordered nominative-first).
const GEO_EN_STEMS: Record<string, string> = (() => {
  const idx: Record<string, string> = {};
  for (const [geo, en] of Object.entries(GEO_EN)) {
    const stem = geoStem(geo);
    if (stem.length >= 3 && !(stem in idx)) idx[stem] = en;
  }
  return idx;
})();

/**
 * Translates a single Georgian-script word to English.
 * (1) Direct dictionary, (2) suffix-stripped dictionary, (3) stem-normalized
 * vocabulary index, (4) geoToLatin() phonetic fallback.
 */
function translateGeoWord(word: string): string {
  if (GEO_EN[word]) return GEO_EN[word];
  for (const suffix of GEO_LOOKUP_SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 2) {
      const stem = word.slice(0, word.length - suffix.length);
      if (GEO_EN[stem]) return GEO_EN[stem];
    }
  }
  // Stem-level normalization — resolves inflected forms whose exact and simple
  // suffix-stripped variants are not direct keys (inflected descriptors).
  const stem = geoStem(word);
  if (stem.length >= 3 && GEO_EN_STEMS[stem]) return GEO_EN_STEMS[stem];
  // Phonetic fallback — produces readable Latin text, never raw Georgian script.
  const latin = geoToLatin(word);
  return latin.charAt(0).toUpperCase() + latin.slice(1);
}

/**
 * Translates a text field for English display.
 * Each Georgian-script word segment is passed through translateGeoWord().
 * Latin-script segments (e.g. "The Wild Wood Tarot") are left unchanged.
 */
export function translateToEnglish(text: string): string {
  if (!containsGeorgian(text)) return text;
  return text
    .replace(/([\u10D0-\u10FF]+)/g, (match) => translateGeoWord(match))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * For proper-noun text (addresses, names): transliterates Georgian words to Latin.
 * Each unknown Georgian word is capitalized (Street Name style).
 * Numbers and Latin text are left unchanged.
 */
function transliterateProperText(text: string): string {
  return text
    .replace(/([\u10D0-\u10FF]+)/g, (match) => {
      if (GEO_EN[match]) return GEO_EN[match];
      const latin = geoToLatin(match);
      return latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parses the Georgian hours pattern "X საათიდან Y საათამდე" and returns English.
 * AM/PM determined from context words: "შუადღ" (afternoon) / "საღამ" (evening) → PM.
 * Returns null if pattern is not present in the text.
 */
function parseGeorgianHours(text: string): string | null {
  // Allow time-of-day words between the two hour markers, e.g.
  // "3 საათიდან საღამოს 9 საათამდე" ("from 3 o'clock in the evening until 9").
  const m = text.match(/(\d+)\s*საათიდან\s+(?:\S+\s+)*?(\d+)\s*საათამდე/);
  if (!m) return null;
  const fromH = parseInt(m[1], 10);
  const toH   = parseInt(m[2], 10);
  const pmContext = /შუადღ|საღამ|შუა\s*დღ/.test(text);
  const fromSuffix = (pmContext && fromH < 12) || fromH >= 12 ? 'PM' : 'AM';
  const toSuffix   = (pmContext && toH   < 12) || toH   >= 12 ? 'PM' : 'AM';
  return `Open from ${fromH} ${fromSuffix} to ${toH} ${toSuffix}`;
}

/**
 * Extracts and formats company info (address, hours, phone) for English display.
 * Georgian text is translated/transliterated deterministically — no AI translation needed.
 *
 * Example input:  "მისამართი ია კარგარეთელი 11. მუშაობს შუადღის 3 საათიდან საღამოს 9 საათამდე"
 * Example output: "Address: Ia Kargareteli 11 | Open from 3 PM to 9 PM"
 */
export function compactCompanyInfoForEnglish(raw: string | null): string {
  if (!raw) return '';
  const n = raw.replace(/\s+/g, ' ').trim();

  const phone = /(?:\+?\d[\d\s\-()]{5,15}\d)/.exec(n)?.[0]?.trim() ?? null;

  const addrMatch = /(?:მისამართი|address)\s*[:,-]?\s*([^\n.]{3,80})/i.exec(n);
  const addrEN = addrMatch
    ? `Address: ${transliterateProperText(addrMatch[1].trim())}`
    : null;

  const hoursMatch = /(?:მუშაობს|working hours?|open)\s*[^\n.]{0,100}/i.exec(n);
  const hoursRaw = hoursMatch ? hoursMatch[0].trim() : null;
  // Strip any phone segment the greedy capture swallowed so the number is not
  // rendered twice (once inside hours, once in the dedicated Phone: field below).
  const hoursText = hoursRaw
    ? hoursRaw
        .replace(/\s*(?:ტელეფონი|phone|tel)\b.*$/i, '')
        .replace(/\+?\d[\d\s\-()]{5,15}\d/g, '')
        .trim()
    : null;
  const hoursEN = hoursText
    ? (parseGeorgianHours(hoursText) ?? translateToEnglish(hoursText))
    : null;

  const parts = [addrEN, hoursEN, phone ? `Phone: ${phone}` : null].filter(Boolean);
  if (parts.length > 0) return parts.join(' | ');

  // Full-text fallback — at least remove all raw Georgian script
  return translateToEnglish(n.slice(0, 160));
}

// Type constraint for product translation — matches ProductContext['products'][0]
type TranslatableProduct = {
  name: string;
  category?: string | null;
  description?: string | null;
  material?: string | null;
  [key: string]: unknown;
};

/**
 * Preprocesses product text fields for English-language prompts.
 * Translates name, category, description, material via the vocabulary table.
 * All other fields (price, currency, images, in_stock, zodiac) are preserved unchanged.
 *
 * This is a pure function — the original product object is not mutated.
 */
export function translateProductForEnglish<T extends TranslatableProduct>(product: T): T {
  return {
    ...product,
    name:        translateToEnglish(product.name),
    category:    product.category    != null ? translateToEnglish(product.category)    : product.category,
    description: product.description != null ? translateToEnglish(product.description) : product.description,
    material:    product.material    != null ? translateToEnglish(product.material)    : product.material,
  };
}
