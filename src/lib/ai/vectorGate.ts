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
 *   A genuine hit clears a CONFIDENT cosine bar. But in a small, thematically-uniform
 *   catalog (e.g. an esoteric shop where almost everything is a "spiritual" item) a query
 *   for an item we do NOT stock pulls a whole DIFFUSE cloud of vaguely-related neighbours
 *   that can all sit just over that bar — and the assistant then presents them as "similar".
 *   So the confident bar alone is not enough. We additionally require a genuine match to
 *   have a FOCUSED LEADER: at least one hit that clears a higher "leader" bar. When the best
 *   hit is only mid-band (confident but not leading) AND several hits are bunched there, that
 *   is exactly the "we don't stock it" cloud → NO_RELEVANT_MATCH. A single, isolated mid-band
 *   hit can still be a real (weak) cross-language match, so it survives — unless the caller
 *   has no lexical/category anchor for the query (requireLeader), in which case even that is
 *   untrusted. A real leader (≥ leader bar) always brings its genuine peers (≥ confident bar)
 *   along, so several genuinely-requested stones are still all kept.
 *
 * Both bars are tunable from production logs (searchSimilarProductsScored logs the raw
 * similarities, and the caller logs the gate decision).
 */

/** A text-vector hit must reach this cosine similarity to count as a real match at all. */
export const CONFIDENT_VECTOR_SIMILARITY = 0.55;

/**
 * A genuine match has at least one hit this high. If the best hit is below this, the whole
 * result is a diffuse cloud (or a lone weak hit) — never a confident "here is the item".
 */
export const FOCUSED_LEADER_SIMILARITY = 0.62;

/**
 * Filters scored vector hits down to the genuinely-confident ones.
 * Returns product names (best-first), or [] when nothing is confident.
 * Pure function — no I/O — so it is fully unit-testable with synthetic scores.
 *
 * @param opts.confidentBar  minimum cosine for a hit to survive alongside a leader (default 0.55)
 * @param opts.leaderBar     cosine the BEST hit must reach for the result to count (default 0.62)
 * @param opts.requireLeader when true, a lone mid-band hit (no leader) is also dropped — used
 *                           when the query has no lexical/category anchor to corroborate it.
 */
export function gateConfidentVectorMatches(
  hits: ScoredProductMatch[],
  opts: { confidentBar?: number; leaderBar?: number; requireLeader?: boolean } = {},
): string[] {
  const confidentBar = opts.confidentBar ?? CONFIDENT_VECTOR_SIMILARITY;
  const leaderBar = opts.leaderBar ?? FOCUSED_LEADER_SIMILARITY;
  if (hits.length === 0) return [];

  const keep = hits
    .filter(h => h.similarity >= confidentBar)
    .sort((a, b) => b.similarity - a.similarity);
  if (keep.length === 0) return [];

  // A real match tops out at or above the leader bar → keep it and its genuine peers.
  if (keep[0].similarity >= leaderBar) return keep.map(h => h.name);

  // No confident leader: the best hit is only mid-band (confidentBar..leaderBar).
  // A BUNCHED cloud of several mid-band hits is the "we don't stock it" failure mode → drop all.
  // A single, isolated mid-band hit may still be a genuine weak cross-language match — keep it,
  // unless the caller has no lexical/category anchor to trust it against.
  if (keep.length === 1 && !opts.requireLeader) return keep.map(h => h.name);
  return [];
}
