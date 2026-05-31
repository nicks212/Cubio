// Returns true when a and b are within edit distance 1 — i.e. identical, or differ by exactly one insertion, deletion, or substitution.
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
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) {
      return shorter.slice(i) === longer.slice(i + 1);
    }
  }
  return true;
}
// Georgian morphological endings (longest-first for greedy stripping).
const GEO_SUFFIXES = ['ebi', 'ebis', 'ebs', 'shi', 'its', 'ad', 'ze', 'is', 'it', 'eb', 's', 'i'];

/**
 * Strips the longest known Georgian morphological suffix from a Latin-script token.
 * Returns the stemmed token (or the original if no suffix matches).
 * Requires the stem to be at least 3 characters after stripping.
 */
export function stemGeoToken(token: string): string {
  for (const suffix of GEO_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}
// Score a single product for a query (was previously present, now restored)
export function scoreProductRetrieval(product: ProductLike, normalizedQuery: string): { score: number; confidence: number; reason: string } {
  const tokens = (normalizedQuery.match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);
  if (!tokens.length) return { score: 0, confidence: 0, reason: 'empty' };

  const nq = (s: string) => normalizeQuery(s);
  // Pre-stem all field tokens once — avoids stemming on every token comparison.
  const stemTokens = (s: string) => (nq(s).match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);

  const nameTokens = stemTokens(product.name);
  const catTokens  = stemTokens(product.category ?? '');
  const matTokens  = stemTokens(product.material ?? '');
  const dscTokens  = stemTokens(product.description ?? '');
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

  // Confidence normalized against the fixed maximum achievable score (exact name match = 10).
  // Using a fixed denominator ensures confidence is independent of query length — longer
  // customer queries (more tokens) do NOT dilute the score of a valid match.
  // Before this fix: "რა ტაროები გაქვთ" (3 tokens) → maxScore=14.5 → conf=0.172 → FILTERED OUT.
  // After: maxScore=10 → conf=0.25 → passes threshold → all matching products surface.
  const maxScore = 10;
  const confidence = Math.min(score / maxScore, 1.0);

  return { score, confidence, reason: reason || 'no match' };
}
// Minimal product type for retrieval logic
export type ProductLike = {
  name: string;
  category?: string | null;
  description?: string | null;
  material?: string | null;
  birthstones?: string | null;
  zodiac_compatibility?: string[] | null;
};
// Restore export for normalizeQuery for use in processIncomingMessage
export function normalizeQuery(query: string): string {
  let q = query.toLowerCase().trim();
  q = geoToLatin(q);
  q = q.replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return q;
}
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
  if (la === lb) {
    // Allow exactly 0 or 1 substitution
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false;
    }
    return true;
  }

// ...existing code...

// When returning product matches for craft_shop, always cap at 3 results for prompt efficiency
export function getTopProductMatches(matches: RetrievalMatch[], products: ProductLike[], max = 3): ProductLike[] {
  const sorted = matches
    .sort((a, b) => b.confidence - a.confidence)
    .map(m => products.find(p => p.name === m.name))
    .filter(Boolean) as ProductLike[];
  return sorted.slice(0, max);
}
// ...existing code...
  const tokens = (normalizedQuery.match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);
  if (!tokens.length) return { score: 0, confidence: 0, reason: 'empty' };

  const nq = (s: string) => normalizeQuery(s);

  // Pre-stem all field tokens once — avoids stemming on every token comparison.
  const stemTokens = (s: string) => (nq(s).match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);

  const nameTokens = stemTokens(product.name);
  const catTokens  = stemTokens(product.category ?? '');
  const matTokens  = stemTokens(product.material ?? '');
  const dscTokens  = stemTokens(product.description ?? '');
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

  // (keywords removed)

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

  // Confidence normalized against the fixed maximum achievable score (exact name match = 10).
  // Using a fixed denominator ensures confidence is independent of query length — longer
  // customer queries (more tokens) do NOT dilute the score of a valid match.
  // Before this fix: "რა ტაროები გაქვთ" (3 tokens) → maxScore=14.5 → conf=0.172 → FILTERED OUT.
  // After: maxScore=10 → conf=0.25 → passes threshold → all matching products surface.
  const maxScore = 10;
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
