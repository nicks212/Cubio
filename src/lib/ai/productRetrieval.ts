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
 * Common transliterated Georgian suffix endings that change a word's grammatical
 * form without changing its semantic root.
 *
 * These are the Latin-script equivalents that geoToLatin() produces from Georgian
 * grammatical suffixes: plural (-ები), genitive (-ის/-ს), instrumental (-ით),
 * locative (-ში/-ზე), dative (-ს), adverbial (-ად).
 *
 * Stripping them allows "chxirebi" (plural) to match product "chxiri" (singular),
 * "samajuris" (genitive) to match "samajuri", etc. — without any hardcoded
 * synonym mappings specific to a business type.
 *
 * Sorted longest-first so greedy matching removes the longest applicable suffix.
 */
// Georgian morphological endings (longest-first for greedy stripping).
// Includes the common nominative case ending 'i' (e.g. "კიტენი"→"kiteni"→"kiten")
// so phonetic partial matches work for inflected Georgian brand-name spellings.
const GEO_SUFFIXES = ['ebi', 'ebis', 'ebs', 'shi', 'its', 'ad', 'ze', 'is', 'it', 'eb', 's', 'i'];

/**
 * Strips the longest known Georgian morphological suffix from a Latin-script token.
 * Returns the stemmed token (or the original if no suffix matches).
 * Requires the stem to be at least 3 characters after stripping.
 */
function stemGeoToken(token: string): string {
  for (const suffix of GEO_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

/**
 * Normalizes a raw query string to a canonical Latin form for cross-script matching:
 *  1. Lowercase
 *  2. Convert Georgian script via geoToLatin
 *  3. Strip non-alphanumeric except hyphens
 *
 * Synonym/shortcut mappings are intentionally absent — semantic matching is
 * handled by the pgvector embedding layer (searchSimilarProducts).  This function
 * is responsible only for script normalization so token-based matching can work
 * across Georgian script, romanized Georgian, and Latin queries.
 */
export function normalizeQuery(query: string): string {
  let q = query.toLowerCase().trim();
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
  keywords?: string | null;
};

/**
 * Returns true when a and b are within edit distance 1 — i.e. identical, or differ
 * by exactly one insertion, deletion, or substitution.  O(max(|a|,|b|)) — no DP matrix
 * needed since we only care about whether the distance is ≤ 1.
 *
 * Used as a fuzzy fallback in countHits() to catch:
 *   - One-character transliteration gaps: "kiten" ↔ "kitten" (single 't' insertion)
 *   - Minor typos: "tarto" ↔ "tarot" (transposition reads as 2 substitutions but ED=2,
 *     so those are correctly NOT matched — only genuine single-char errors qualify)
 */
export function withinEditDistance1(a: string, b: string): boolean {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    // Allow exactly 0 or 1 substitution
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false;
    }
    return true;
  }
  // Lengths differ by 1 — check if shorter is inside longer with one gap (1 insertion)
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  let si = 0, li = 0, skipped = 0;
  while (si < shorter.length && li < longer.length) {
    if (shorter[si] === longer[li]) { si++; li++; }
    else if (++skipped > 1) return false;
    else li++;
  }
  return true;
}

/**
 * Scores one product against a normalized query using stem-aware token matching.
 *
 * Matching strategy:
 * 1. Both query tokens and product field tokens are stemmed via stemGeoToken()
 *    before comparison.  This lets inflected forms ("chxirebi") match base forms
 *    ("chxiri") without any hardcoded synonym tables.
 * 2. Fields are weighted by specificity: name > category/material > description/keywords > zodiac
 * 3. Confidence is normalized to 0–1 against the theoretical maximum score.
 */
export function scoreProductRetrieval(
  product: ProductLike,
  normalizedQuery: string,
): { score: number; confidence: number; reason: string } {
  const tokens = (normalizedQuery.match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);
  if (!tokens.length) return { score: 0, confidence: 0, reason: 'empty' };

  const nq = (s: string) => normalizeQuery(s);

  // Pre-stem all field tokens once — avoids stemming on every token comparison.
  const stemTokens = (s: string) => (nq(s).match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);

  const nameTokens = stemTokens(product.name);
  const catTokens  = stemTokens(product.category ?? '');
  const matTokens  = stemTokens(product.material ?? '');
  const dscTokens  = stemTokens(product.description ?? '');
  const kwTokens   = stemTokens(product.keywords ?? '');
  const stTokens   = stemTokens(product.birthstones ?? '');
  const zodTokens  = (product.zodiac_compatibility ?? []).flatMap(z => stemTokens(z));

  // Helper: count how many query tokens have at least one stemmed field token that
  // matches exactly, matches by prefix (partial coverage), OR is within edit distance 1
  // for tokens of length ≥ 4 (handles single-char transliteration gaps like kiten↔kitten).
  const countHits = (fieldTokens: string[]) =>
    tokens.filter(qt =>
      fieldTokens.some(ft =>
        ft === qt ||
        ft.startsWith(qt) ||
        qt.startsWith(ft) ||
        (qt.length >= 4 && ft.length >= 4 && withinEditDistance1(qt, ft))
      )
    ).length;

  let score = 0;
  let reason = '';

  // 1. Name match — highest weight
  const nameHits = countHits(nameTokens);
  const nameJoined = nameTokens.join(' ');
  const queryJoined = tokens.join(' ');
  if (nameJoined === queryJoined) {
    score += 10; reason = 'exact name';
  } else if (nameJoined.includes(queryJoined) || queryJoined.includes(nameJoined)) {
    score += 8; reason = 'name contains query';
  } else if (nameHits === tokens.length) {
    score += 7; reason = 'all tokens in name';
  } else if (nameHits > 0) {
    score += nameHits * 2.5;
    reason = `${nameHits}/${tokens.length} name tokens`;
  }

  // 2. Category tokens — full match equivalent to name match; partial at 2.5 each
  const catHits = countHits(catTokens);
  if (catHits > 0) {
    if (catHits === tokens.length) {
      score += 7; if (!reason) reason = 'all tokens match category';
    } else {
      score += catHits * 2.5;
      if (!reason) reason = `${catHits} category tokens`;
    }
  }

  // 3. Material tokens — 2.0 each
  const matHits = countHits(matTokens);
  if (matHits > 0) {
    score += matHits * 2.0;
    if (!reason) reason = `${matHits} material tokens`;
  }

  // 4. Keywords — 1.5 each (business-provided search terms)
  const kwHits = countHits(kwTokens);
  if (kwHits > 0) {
    score += kwHits * 1.5;
    if (!reason) reason = `${kwHits} keyword tokens`;
  }

  // 5. Description tokens — 1.0 each, capped at 3
  const dscHits = Math.min(countHits(dscTokens), 3);
  if (dscHits > 0) {
    score += dscHits;
    if (!reason) reason = `${dscHits} description tokens`;
  }

  // 6. Birthstones / zodiac — 1.0 each
  const spdHits = countHits([...stTokens, ...zodTokens]);
  if (spdHits > 0) {
    score += spdHits;
    if (!reason) reason = `${spdHits} stone/zodiac tokens`;
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
