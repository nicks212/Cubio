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
 *   1. The single best hit must clear a CONFIDENT cosine bar. A genuine cross-language
 *      match (e.g. "ამეთვისტოს გულსაკიდი" → "Amethyst Pendant") sits well above it; a
 *      vaguely-related cluster sits below → everything is dropped (NO_RELEVANT_MATCH).
 *   2. Keep the leader plus any near-tie within a small margin (so two genuinely-relevant
 *      variants both surface), and drop the diffuse tail.
 *
 * Both constants are tunable from production logs (searchSimilarProductsScored logs the
 * raw similarities, and gateConfidentVectorMatches logs its decision).
 */

/** A text-vector hit must reach this cosine similarity to count as a real match. */
export const CONFIDENT_VECTOR_SIMILARITY = 0.55;

/** Keep hits within this cosine margin of the top hit; drop the rest as a diffuse tail. */
export const VECTOR_LEADER_MARGIN = 0.08;

/**
 * Filters scored vector hits down to genuinely-confident, focused matches.
 * Returns product names (best-first), or [] when the neighbourhood is diffuse/weak.
 * Pure function — no I/O — so it is fully unit-testable with synthetic scores.
 */
export function gateConfidentVectorMatches(
  hits: ScoredProductMatch[],
  confidentBar = CONFIDENT_VECTOR_SIMILARITY,
  leaderMargin = VECTOR_LEADER_MARGIN,
): string[] {
  if (hits.length === 0) return [];
  const sorted = [...hits].sort((a, b) => b.similarity - a.similarity);
  const top = sorted[0].similarity;

  // 1. The best hit itself must be a confident semantic match.
  if (top < confidentBar) return [];

  // 2. Keep the leader and near-ties; drop the diffuse tail.
  return sorted
    .filter(h => h.similarity >= confidentBar && top - h.similarity <= leaderMargin)
    .map(h => h.name);
}
