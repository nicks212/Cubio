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
// Returns true when a and b are within edit distance 2.
// Used for Georgian oblique-stem metathesis where a vowel and consonant swap position
// (e.g. santleb ↔ santel: transposition + deletion = ed 2, beyond withinEditDistance1).
// Only applied to tokens ≥ 5 chars to keep false-positive risk low.
export function withinEditDistance2(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  if (withinEditDistance1(a, b)) return true;
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const val = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = val;
    }
    if (Math.min(...row) > 2) return false; // early exit
  }
  return row[n] <= 2;
}
// English function words that carry no retrieval signal and must be stripped
// before token matching.  Without this, "Do you have emerald stones?" scores
// "do" and "have" hits against product names/descriptions, producing nonsense
// matches like "I am not a Doll" (doll.startsWith("do") = true).
const EN_STOPWORDS = new Set([
  'do', 'does', 'did', 'have', 'has', 'had',
  'you', 'your', 'we', 'our', 'they', 'their', 'it', 'its',
  'is', 'are', 'was', 'were', 'be', 'been',
  'the', 'an', 'can', 'could', 'would', 'should', 'will', 'may', 'might',
  'this', 'that', 'these', 'those', 'what', 'which', 'who',
  'show', 'tell', 'me', 'to', 'in', 'of', 'for', 'on', 'at', 'or', 'and', 'not',
]);

// Georgian morphological endings (longest-first for greedy stripping).
const GEO_SUFFIXES = ['ebi', 'ebis', 'ebs', 'shi', 'its', 'ad', 'ze', 'is', 'it', 'eb', 's', 'i'];

// Latin vowels used for consonant-cluster detection in stemGeoToken.
const LATIN_VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * Strips the longest known Georgian morphological suffix from a Latin-script token.
 * Returns the stemmed token (or the original if no suffix matches).
 * Requires the stem to be at least 3 characters after stripping.
 *
 * Consonant-cluster guard: if stripping a suffix leaves the stem ending in two
 * consecutive non-vowels (e.g. 'ebi' from "santlebi" → "santl", ending in CC 'tl'),
 * that suffix is skipped and the next candidate is tried.  This prevents over-stripping
 * that produces misleading short stems — e.g. "santl" which ed-1 matches "santa".
 */
export function stemGeoToken(token: string): string {
  for (const suffix of GEO_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      const stem = token.slice(0, token.length - suffix.length);
      // Reject stems that end in a consonant cluster (CC at tail).
      // A valid Georgian morphological stem ends in a vowel or single consonant.
      if (
        stem.length >= 2 &&
        !LATIN_VOWELS.has(stem[stem.length - 1]) &&
        !LATIN_VOWELS.has(stem[stem.length - 2])
      ) {
        continue; // try the next shorter suffix
      }
      return stem;
    }
  }
  return token;
}
// Score a single product for a query.
// Returns score, confidence, reason, and matchedFields (["field:token"] pairs) for diagnostics.
export function scoreProductRetrieval(
  product: ProductLike,
  normalizedQuery: string,
): { score: number; confidence: number; reason: string; matchedFields: string[] } {
  const tokens = (normalizedQuery.match(/[a-z0-9]{2,}/g) ?? [])
    .map(stemGeoToken)
    .filter(t => !EN_STOPWORDS.has(t));
  if (!tokens.length) return { score: 0, confidence: 0, reason: 'empty', matchedFields: [] };

  const nq = (s: string) => normalizeQuery(s);
  // Pre-stem all field tokens once — avoids re-stemming on every comparison.
  const stemTokens = (s: string) => (nq(s).match(/[a-z0-9]{2,}/g) ?? []).map(stemGeoToken);

  const nameTokens = stemTokens(product.name);
  const catTokens  = stemTokens(product.category ?? '');
  const matTokens  = stemTokens(product.material ?? '');
  const dscTokens  = stemTokens(product.description ?? '');
  const stTokens   = stemTokens(product.birthstones ?? '');
  const zodTokens  = (product.zodiac_compatibility ?? []).flatMap(z => stemTokens(z));

  // Returns the subset of query tokens that match at least one token in fieldTokens.
  // Match modes:
  //   exact          — always allowed
  //   prefix         — ft.startsWith(qt) only when qt≥4 chars (prevents "do"→"doll")
  //                  — qt.startsWith(ft) only when ft≥4 chars (prevents short field stubs)
  //   ed-1 (len≥4)  — one-char typo tolerance
  //   ed-2 (len≥6)  — Georgian oblique-stem metathesis only; raised from 5 to prevent
  //                    stemmed English words ("storie" from "stories") matching 5-char
  //                    English query tokens ("stone" ed-2 "storie" = 2 ≤ 2 → false positive)
  const getMatchedTokens = (fieldTokens: string[]): string[] =>
    tokens.filter(qt =>
      fieldTokens.some(ft =>
        ft === qt ||
        (qt.length >= 4 && ft.startsWith(qt)) ||
        (ft.length >= 4 && qt.startsWith(ft)) ||
        (qt.length >= 4 && ft.length >= 4 && withinEditDistance1(qt, ft)) ||
        (qt.length >= 6 && ft.length >= 6 && withinEditDistance2(qt, ft))
      )
    );

  const matchedFields: string[] = [];
  let score = 0;
  let reason = '';

  // 1. Name match — highest weight
  const nameMatched = getMatchedTokens(nameTokens);
  const nameHits = nameMatched.length;
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
  matchedFields.push(...nameMatched.map(t => `name:${t}`));

  // 2. Category tokens — full match at 7, partial at 2.5 each
  const catMatched = getMatchedTokens(catTokens);
  const catHits = catMatched.length;
  if (catHits > 0) {
    if (catHits === tokens.length) {
      score += 7; if (!reason) reason = 'all tokens match category';
    } else {
      score += catHits * 2.5;
      if (!reason) reason = `${catHits} category tokens`;
    }
    matchedFields.push(...catMatched.map(t => `category:${t}`));
  }

  // 3. Material tokens — 2.0 each
  const matMatched = getMatchedTokens(matTokens);
  const matHits = matMatched.length;
  if (matHits > 0) {
    score += matHits * 2.0;
    if (!reason) reason = `${matHits} material tokens`;
    matchedFields.push(...matMatched.map(t => `material:${t}`));
  }

  // 5. Description tokens — 1.5 per hit (up from 1.0 cap-3 previously), no cap.
  // Multi-concept co-occurrence bonus: if ≥ 2 distinct query concepts match the description,
  // add +4.0 bonus. A product describing BOTH "inner strength" AND "transformation" ranks
  // far above one that only matches a broad category token like "spiritual" or "meditation".
  const dscMatched = getMatchedTokens(dscTokens);
  const dscHits = dscMatched.length;
  if (dscHits > 0) {
    score += dscHits * 2.5;
    if (dscHits >= 2) score += 4.0; // co-occurrence bonus
    if (!reason) reason = `${dscHits} description tokens${dscHits >= 2 ? ' (+co-occurrence)' : ''}`;
    matchedFields.push(...dscMatched.map(t => `description:${t}`));
  }

  // 6. Birthstones / zodiac — 1.0 each
  const spdMatched = getMatchedTokens([...stTokens, ...zodTokens]);
  const spdHits = spdMatched.length;
  if (spdHits > 0) {
    score += spdHits;
    if (!reason) reason = `${spdHits} stone/zodiac tokens`;
    matchedFields.push(...spdMatched.map(t => `specialty:${t}`));
  }

  // Confidence normalized against fixed max 10 — independent of query length.
  const maxScore = 10;
  const confidence = Math.min(score / maxScore, 1.0);

  return { score, confidence, reason: reason || 'no match', matchedFields };
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

// ─── Category-level fallback retrieval ────────────────────────────────────────
// Used when full-text retrieval returns 0 results for a query that contains a
// recognisable product category keyword (e.g. "square shaped candles" → candle).
//
// The map: English query keywords → field-pattern strings (what normalizeQuery()
// produces from product name/category/description fields — both English values
// AND Georgian transliterations).  This bridges English→Georgian cross-language
// matching that the token engine cannot handle (English "candle" ≠ Georgian
// transliteration "santel").
//
// Pattern matching uses String.includes() on the normalised field text.
// Patterns are deliberately kept ≥ 4 chars to avoid spurious sub-string hits.

const EN_CATEGORY_MAP: Array<{ queryKeywords: string[]; fieldPatterns: string[] }> = [
  {
    queryKeywords: ['candle', 'candles', 'taper', 'wax'],
    // 'sant' matches სანთელი (santeli) and სანთლები (santlebi) via prefix
    fieldPatterns: ['candle', 'sant'],
  },
  {
    queryKeywords: [
      'stone', 'stones', 'crystal', 'crystals', 'gem', 'gems',
      'quartz', 'amethyst', 'emerald', 'mineral', 'minerals',
      'jasper', 'obsidian', 'tourmaline', 'lapis', 'agate', 'onyx', 'jade',
      'ruby', 'sapphire', 'topaz', 'garnet',
    ],
    // 'kva' = ქვა (stone), 'krist' = კრისტალი (crystal), 'ametv' = ამეთვისტო,
    // 'kvar' = კვარცი (quartz), 'aven' = ავენტური (aventurine), 'lazul' = ლაჟვარდი
    fieldPatterns: ['stone', 'crystal', 'quartz', 'amethyst', 'gem', 'mineral',
                    'kva', 'krist', 'ametv', 'kvar', 'aven', 'lazul', 'agat', 'obsid'],
  },
  {
    queryKeywords: ['tarot', 'oracle', 'deck', 'tarot deck', 'oracle deck'],
    fieldPatterns: ['tarot', 'taro', 'oracle', 'deck'],
  },
  {
    queryKeywords: [
      'statue', 'statues', 'figurine', 'figurines', 'idol', 'idols',
      'shiva', 'buddha', 'krishna', 'ganesh', 'lakshmi', 'kali',
    ],
    // 'kand' = ქანდაკება (statue)
    fieldPatterns: ['statue', 'figurine', 'kand', 'shiva', 'buddha', 'krishna', 'ganesh', 'kali'],
  },
  {
    queryKeywords: ['ring', 'rings', 'band'],
    // 'bech' = ბეჭედი (ring)
    fieldPatterns: ['ring', 'bech'],
  },
  {
    queryKeywords: ['necklace', 'necklaces', 'pendant', 'pendants', 'choker'],
    // 'yels' = ყელსაბამი (necklace), 'guls' = გულსაკიდი (pendant)
    fieldPatterns: ['necklace', 'pendant', 'yels', 'guls'],
  },
  {
    queryKeywords: ['bracelet', 'bracelets', 'bangle'],
    // 'samaj' = სამაჯური (bracelet)
    fieldPatterns: ['bracelet', 'samaj'],
  },
  {
    queryKeywords: ['earring', 'earrings'],
    // 'sayu' = საყურე (earrings)
    fieldPatterns: ['earring', 'sayu'],
  },
  {
    queryKeywords: ['jewelry', 'jewellery', 'jewel', 'jewels', 'accessory', 'accessories'],
    // 'samka' = სამკაული (jewel/jewelry)
    fieldPatterns: ['jewelry', 'jewel', 'accessory', 'samka'],
  },
  {
    queryKeywords: ['incense', 'incenses', 'stick', 'sticks', 'joss'],
    // 'kmel' = კმელი (incense), 'surne' = სურნელი (fragrant)
    fieldPatterns: ['incense', 'kmel', 'surne'],
  },
  {
    queryKeywords: ['oil', 'oils', 'essential oil', 'essential oils', 'aroma'],
    // 'zeti' = ზეთი (oil), 'eterov' = ეთეროვანი (essential)
    fieldPatterns: ['oil', 'essential', 'zeti', 'eterov', 'arom'],
  },
  {
    queryKeywords: ['mala', 'malas', 'bead', 'beads', 'prayer beads', 'rosary'],
    // 'mdziv' = მძივი (bead)
    fieldPatterns: ['mala', 'bead', 'mdziv', 'rosary'],
  },
];

/**
 * Extracts the primary product category from a query string.
 * Returns the matching row's fieldPatterns array, or null if no category is recognised.
 *
 * How it works: normalises the query, tokenises, checks each token against the
 * EN_CATEGORY_MAP queryKeywords list. The first matching row wins (ordered by
 * specificity — e.g. "tarot deck" before "deck").
 */
export function extractCategoryKeywords(query: string): string[] | null {
  const qNorm = normalizeQuery(query);
  const tokens = (qNorm.match(/[a-z0-9]{2,}/g) ?? [])
    .map(stemGeoToken)
    .filter(t => !EN_STOPWORDS.has(t));
  for (const { queryKeywords, fieldPatterns } of EN_CATEGORY_MAP) {
    if (tokens.some(t => queryKeywords.some(k =>
      t === k ||
      // Prefix matches require BOTH sides ≥ 4 chars — mirrors the scorer's getMatchedTokens
      // guard. Without it, short tokens (esp. Georgian function words like "რო"/"ro") match
      // a category keyword by prefix ("rosary".startsWith("ro")), dragging an unrelated
      // category (and its products) into an unrelated query. "taro"→"tarot" still matches.
      (t.length >= 4 && k.length >= 4 && (t.startsWith(k) || k.startsWith(t)))
    ))) {
      return fieldPatterns;
    }
  }
  return null;
}

/**
 * Returns all products whose normalised name + category + description field text
 * contains at least one of the provided fieldPatterns (substring match).
 *
 * Used as the second-pass retrieval step when full-text retrieval returns 0 results.
 * Results are assigned a fixed confidence of 0.25 (above minConfidence threshold
 * but below any specific-token match score) so they are clearly tagged as
 * category-level alternatives, not exact matches.
 */
export function retrieveProductsByCategory(
  products: ProductLike[],
  fieldPatterns: string[],
): RetrievalMatch[] {
  return products
    .filter(p => {
      const fieldText = [
        normalizeQuery(p.name),
        normalizeQuery(p.category    ?? ''),
        normalizeQuery(p.description ?? ''),
      ].join(' ');
      return fieldPatterns.some(pat => fieldText.includes(pat));
    })
    .map(p => ({
      name:          p.name,
      score:         2.5,
      confidence:    0.25,
      reason:        'category fallback',
      matchedFields: [`category:fallback`],
    }));
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
  /** Per-field match evidence — entries like "name:shiva", "description:shinagani". Used for retrieval diagnostics. */
  matchedFields: string[];
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
 * Ranks all products by retrieval score against the raw user query.
 * Returns matches sorted descending by score, filtered to minConfidence.
 *
 * Logs two diagnostic entries per call:
 *   [retrieval-score]  — per-candidate score, confidence, and matched fields
 *   [retrieval-score] final — top-10 ranked names after gap filter
 *
 * Score-gap filter: when the top candidate is significantly stronger than the second
 * (top ≥ second × 1.5 + 1.5), restrict results to candidates with score ≥ top × 0.5.
 * Prevents weak generic matches (category-only "spiritual", "meditation") from filling
 * top slots alongside a product that specifically matches the queried concepts.
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
  const all = products
    .map(p => ({ name: p.name, ...scoreProductRetrieval(p, nq) }))
    .filter(r => r.confidence >= minConfidence)
    .sort((a, b) => b.score - a.score);

  // Per-candidate score log — proves exactly why each product was retrieved.
  if (all.length > 0) {
    const lines = all.map(
      r =>
        `  "${r.name}" score=${r.score.toFixed(1)} conf=${r.confidence.toFixed(2)}` +
        (r.matchedFields.length ? ` matches=[${r.matchedFields.join(', ')}]` : ''),
    );
    console.info(
      `[retrieval-score] query="${query.slice(0, 60)}" — ${all.length} candidates above threshold:\n` +
      lines.join('\n'),
    );
  }

  // Score-gap filter.
  let filtered = all;
  if (all.length >= 2 && all[0].score >= all[1].score * 1.5 + 1.5) {
    const threshold = all[0].score * 0.5;
    filtered = all.filter(r => r.score >= threshold);
    console.info(
      `[retrieval-score] gap-filter: top=${all[0].score.toFixed(1)} ` +
      `second=${all[1].score.toFixed(1)} → keeping score≥${threshold.toFixed(1)} ` +
      `(${filtered.length}/${all.length} candidates remain)`,
    );
  }

  // Final ranking summary — what loadBusinessContext receives.
  if (filtered.length > 0) {
    console.info(
      `[retrieval-score] final: ` +
      filtered.slice(0, 10).map((r, i) => `#${i + 1} "${r.name}"=${r.score.toFixed(1)}`).join(' | '),
    );
  }

  return filtered;
}
