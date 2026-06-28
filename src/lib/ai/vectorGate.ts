import type { ScoredProductMatch } from './embeddings';

/**
 * Relevance gate for TEXT-vector product hits.
 *
 * WHY THIS EXISTS
 * Text-vector hits used to be promoted into the prompt's matched-products list on cosine
 * ≥ 0.45 alone. In a small catalog every figurine/decor item embeds close together, so a
 * query for an item we do NOT stock ("ხის ბაყაყი" / wooden frog) pulls the whole cluster
 * (horse, dragon, Buddha, Krishna…) at ~0.45-0.50 — and the assistant then "recommends"
 * Buddha. The deterministic token/category path already drops such queries to
 * NO_RELEVANT_MATCH; this gate brings the vector path under the SAME discipline so a
 * diffuse neighbourhood can never masquerade as the requested product.
 *
 * RULE (purely structural — no product names, no per-product logic):
 *   Keep every hit that clears a CONFIDENT cosine bar. A genuine match (e.g. cross-language
 *   "ამეთვისტოს გულსაკიდი" → "Amethyst Pendant", or each of several requested stones) sits
 *   above the bar and survives. A vaguely-related cluster — what a query for an item we do
 *   NOT stock pulls in — sits BELOW the bar, so it all drops (NO_RELEVANT_MATCH). The bar
 *   alone separates "asked-for" from "merely nearby"; we intentionally do NOT also collapse
 *   to a single leader, because that discarded the 2nd/3rd genuinely-requested item.
 *
 * The bar is tunable from production logs (searchSimilarProductsScored logs the raw
 * similarities, and the caller logs the gate decision).
 */

/** A text-vector hit must reach this cosine similarity to count as a real match. */
export const CONFIDENT_VECTOR_SIMILARITY = 0.55;

/**
 * Filters scored vector hits down to the genuinely-confident ones (≥ the bar).
 * Returns product names (best-first), or [] when nothing is confident.
 * Pure function — no I/O — so it is fully unit-testable with synthetic scores.
 */
export function gateConfidentVectorMatches(
  hits: ScoredProductMatch[],
  confidentBar = CONFIDENT_VECTOR_SIMILARITY,
): string[] {
  if (hits.length === 0) return [];
  return hits
    .filter(h => h.similarity >= confidentBar)
    .sort((a, b) => b.similarity - a.similarity)
    .map(h => h.name);
}
