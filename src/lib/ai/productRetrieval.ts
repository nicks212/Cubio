/**
 * Deterministic product retrieval with transliteration normalization,
 * fuzzy token matching across all searchable fields, and confidence scoring.
 *
 * Supplements vector search for cases where the customer's query is in a
 * different script (e.g. romanized Georgian "taro" vs Georgian "ტარო"),
 * has partial spelling, or uses common word variations.
 *
 * Zero AI calls — pure string processing, runs in <1ms.
 */

export interface RetrievalMatch {
  name: string;
  score: number;
  /** Normalized 0.0–1.0 confidence value. */
  confidence: number;
  reason: string;
}

// ── Georgian character → Latin phonetic mapping ──────────────────────────────
const GEO_LATIN: [string, string][] = [
  ['ა','a'],['ბ','b'],['გ','g'],['დ','d'],['ე','e'],
  ['ვ','v'],['ზ','z'],['თ','t'],['ი','i'],['კ','k'],
  ['ლ','l'],['მ','m'],['ნ','n'],['ო','o'],['პ','p'],
  ['ჟ','zh'],['რ','r'],['ს','s'],['ტ','t'],['უ','u'],
  ['ფ','f'],['ქ','k'],['ღ','gh'],['ყ','q'],['შ','sh'],
  ['ჩ','ch'],['ც','ts'],['ძ','dz'],['წ','ts'],['ჭ','ch'],
  ['ხ','kh'],['ჯ','j'],['ჰ','h'],
];

/** Convert Georgian script text to Latin phonetic equivalent. */
export function geoToLatin(text: string): string {
  let r = text;
  for (const [g, l] of GEO_LATIN) r = r.split(g).join(l);
  return r;
}

/**
 * Common Latin romanizations and English equivalents that map to the same
 * normalized form as their Georgian equivalent after geoToLatin().
 * Key = user input; value = normalized Latin token to use when matching.
 */
const SHORTCUTS: Record<string, string> = {
  // Tarot / ტარო
  taro: 'taro', tarot: 'taro', taroti: 'taro', taros: 'taro', taroebi: 'taro', 'taro kartebis': 'taro',
  // Essential oils / ეთერზეთი
  eterzetebi: 'eterzeti', eterzetsebi: 'eterzeti', eterzets: 'eterzeti', eterzetis: 'eterzeti',
  'essential oil': 'eterzeti', 'essential oils': 'eterzeti',
  'ether oil': 'eterzeti', 'ether oils': 'eterzeti',
  'flavour oil': 'eterzeti', 'flavour oils': 'eterzeti',
  'flavor oil': 'eterzeti', 'flavor oils': 'eterzeti',
  // Jewelry types
  ring: 'bechedi', rings: 'bechedi',
  bracelet: 'samajuri', bracelets: 'samajuri',
  necklace: 'qelsabami', necklaces: 'qelsabami',
  yelsabami: 'qelsabami', yelsabamebi: 'qelsabami', yelsabamis: 'qelsabami',
  earring: 'sayure', earrings: 'sayure',
  pendant: 'qelsabami',
  // Materials / metals
  silver: 'vercxli', gold: 'oqro',
  // Gemstones
  malachite: 'malakit', malachit: 'malakit',
  lazurite: 'lazurit', lazurit: 'lazurit',
  amethyst: 'ametisti', amethist: 'ametisti',
  crystal: 'kristali', cristal: 'kristali',
  amber: 'qariaqala',
};

/**
 * Normalizes a raw query string to a canonical Latin form for cross-script matching:
 *  1. Lowercase
 *  2. Apply known shortcuts (gold → oqro, taro → taro, etc.)
 *  3. Convert remaining Georgian script via geoToLatin
 *  4. Strip non-alphanumeric except hyphens
 */
export function normalizeQuery(query: string): string {
  let q = query.toLowerCase().trim();
  // Apply shortcuts — whole-word replacement only
  for (const [src, dst] of Object.entries(SHORTCUTS)) {
    const re = new RegExp(`(?<![a-z\\u10D0-\\u10FF])${src}(?![a-z\\u10D0-\\u10FF])`, 'gi');
    if (re.test(q)) q = q.replace(re, dst);
  }
  q = geoToLatin(q);
  q = q.replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return q;
}

type ProductLike = {
  name: string;
  category?: string | null;
  description?: string | null;
  material?: string | null;
  birthstones?: string | null;
  zodiac_compatibility?: string[] | null;
};

/**
 * Scores one product against a normalized query.
 * Checks all searchable fields with different weights.
 */
export function scoreProductRetrieval(
  product: ProductLike,
  normalizedQuery: string,
): { score: number; confidence: number; reason: string } {
  const tokens = normalizedQuery.match(/[a-z0-9]{2,}/g) ?? [];
  if (!tokens.length) return { score: 0, confidence: 0, reason: 'empty' };

  const nq = (s: string) => normalizeQuery(s);
  const fname = nq(product.name);
  const fcat  = nq(product.category ?? '');
  const fmat  = nq(product.material ?? '');
  const fdesc = nq(product.description ?? '');
  const fst   = nq(product.birthstones ?? '');
  const fzod  = (product.zodiac_compatibility ?? []).map(nq).join(' ');

  let score = 0;
  let reason = '';

  // 1. Name match — highest weight
  const joined = tokens.join(' ');
  if (fname === joined) {
    score += 10; reason = 'exact name';
  } else if (fname.includes(joined) || joined.includes(fname)) {
    score += 8; reason = 'name contains query';
  } else {
    const nameHits = tokens.filter(t => fname.includes(t));
    if (nameHits.length === tokens.length) {
      score += 7; reason = 'all tokens in name';
    } else if (nameHits.length > 0) {
      score += nameHits.length * 2.5;
      reason = `${nameHits.length}/${tokens.length} name tokens`;
    }
  }

  // 2. Category tokens — weight 1.5 each
  const catHits = fcat ? tokens.filter(t => fcat.includes(t)) : [];
  if (catHits.length > 0) {
    score += catHits.length * 1.5;
    if (!reason) reason = `${catHits.length} category tokens`;
  }

  // 3. Material tokens — weight 1.5 each
  const matHits = fmat ? tokens.filter(t => fmat.includes(t)) : [];
  if (matHits.length > 0) {
    score += matHits.length * 1.5;
    if (!reason) reason = `${matHits.length} material tokens`;
  }

  // 4. Description tokens — weight 1.0 each, capped at 3
  const dscHits = fdesc ? tokens.filter(t => fdesc.includes(t)).slice(0, 3) : [];
  if (dscHits.length > 0) {
    score += dscHits.length;
    if (!reason) reason = `${dscHits.length} description tokens`;
  }

  // 5. Birthstones / zodiac — weight 1.0 each
  const spdHits = tokens.filter(t => fst.includes(t) || fzod.includes(t));
  if (spdHits.length > 0) {
    score += spdHits.length;
    if (!reason) reason = `${spdHits.length} stone/zodiac tokens`;
  }

  // Confidence normalized against maximum possible score
  const maxScore = 10 + tokens.length * 1.5;
  const confidence = Math.min(score / maxScore, 1.0);

  return { score, confidence, reason: reason || 'no match' };
}

/**
 * Ranks all products by retrieval score against the raw user query.
 * Returns matches sorted descending by score, filtered to minConfidence.
 *
 * @param products      All available products
 * @param query         Raw user query (any script/language)
 * @param minConfidence Minimum confidence to include (default 0.20)
 */
export function retrieveProducts(
  products: ProductLike[],
  query: string,
  minConfidence = 0.20,
): RetrievalMatch[] {
  if (!query.trim()) return [];
  const nq = normalizeQuery(query);
  return products
    .map(p => ({ name: p.name, ...scoreProductRetrieval(p, nq) }))
    .filter(r => r.confidence >= minConfidence)
    .sort((a, b) => b.score - a.score);
}
