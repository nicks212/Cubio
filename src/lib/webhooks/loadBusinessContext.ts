import { createAdminClient } from '@/lib/supabase/server';
import type { BusinessContext } from '@/lib/ai';
import { retrieveProducts, extractCategoryKeywords, retrieveProductsByCategory } from '@/lib/ai/productRetrieval';

/** Options for context loading — used when vector similarity search pre-filtered results. */
export interface LoadContextOptions {
  /** Apartment numbers from vector search — these will be sorted to the top. */
  priorityApartmentNumbers?: string[];
  /** Product names from vector search — these will be sorted to the top. */
  priorityProductNames?: string[];
  /** Text query from image description — used for tighter text-based pre-filter fallback. */
  imageSearchQuery?: string;
  /**
   * Raw user message text — fed into deterministic product retrieval to catch
   * script-variant queries (e.g. romanized Georgian "taro" vs Georgian "ტარო").
   * Only used for craft_shop; ignored for real_estate.
   */
  textQuery?: string;
}

/**
 * Loads the appropriate business context data for the AI
 * based on the company's business type, including the optional
 * business_description the company owner wrote during onboarding/settings.
 *
 * When vector similarity results are provided via `options`, those items
 * are placed at the front of the list so the prompt builder surfaces them
 * as the top-3 recommendations.
 */
export async function loadBusinessContext(
  companyId: string,
  businessType: 'real_estate' | 'craft_shop',
  options: LoadContextOptions = {},
): Promise<BusinessContext> {
  const supabase = createAdminClient();

  // Fetch business description alongside inventory
  const { data: company } = await supabase
    .from('companies')
    .select('business_description')
    .eq('id', companyId)
    .single();

  const businessDescription = (company?.business_description as string | null) ?? null;

  if (businessType === 'real_estate') {
    const { data: apartments, error: aptError } = await supabase
      .from('apartments')
      .select('apartment_number, size_sq_m, floor, rooms_quantity, price_per_sq_m, total_price, currency, status, images, project:projects(name, location, description, completion_date, images)')
      .eq('company_id', companyId)
      .eq('status', 'vacant')
      .is('deleted_at', null)
      .order('floor', { ascending: true })
      .limit(30);

    // Fallback: if `currency` column doesn't exist yet (migration pending), retry without it
    let finalApartments = apartments;
    if (aptError) {
      console.warn('[loadBusinessContext] apartment query failed, retrying without currency:', aptError.message);
      const { data: aptFallback } = await supabase
        .from('apartments')
        .select('apartment_number, size_sq_m, floor, rooms_quantity, price_per_sq_m, total_price, status, images, project:projects(name, location, description, completion_date, images)')
        .eq('company_id', companyId)
        .eq('status', 'vacant')
        .is('deleted_at', null)
        .order('floor', { ascending: true })
        .limit(30);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finalApartments = aptFallback as any;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allApartments: any[] = (finalApartments ?? []) as any[];

    // If vector search found similar apartments, bubble them to the front.
    // The prompt builder picks top-3 from the array — so these appear first.
    if (options.priorityApartmentNumbers && options.priorityApartmentNumbers.length > 0) {
      const prioritySet = new Set(options.priorityApartmentNumbers);
      const prioritized = allApartments.filter((a: { apartment_number: string }) => prioritySet.has(a.apartment_number));
      const rest        = allApartments.filter((a: { apartment_number: string }) => !prioritySet.has(a.apartment_number));
      allApartments = [...prioritized, ...rest];
      console.info(`[loadBusinessContext] ${prioritized.length} priority apartments from vector search surfaced to top`);
    }

    return { apartments: allApartments, businessDescription };
  }


  // Fetch up to 20 products — enough for retrieval ranking without loading the entire catalog.
  // Vector/token retrieval promotes the best matches to the front; prompt builder slices to 6.
  // Load up to 200 products without an alphabetical ordering bias.
  // ORDER BY name ASC caused Latin-script products (tarot, crystals) to always precede
  // Georgian-script products (jewelry, candles) in the 20-item window, silently
  // excluding entire categories before retrieval even started.
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('name, price, currency, category, in_stock, images, description')
    .eq('company_id', companyId)
    .eq('in_stock', true)
    .is('deleted_at', null)
    .limit(200);

  // Fallback: if `currency` column doesn't exist yet (migration pending), retry without it
  let finalProducts = products;
  if (prodError) {
    console.warn('[loadBusinessContext] product query failed, retrying without currency:', prodError.message);
    const { data: prodFallback } = await supabase
      .from('products')
      .select('name, price, category, in_stock, images, description')
      .eq('company_id', companyId)
      .eq('in_stock', true)
      .is('deleted_at', null)
      .limit(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalProducts = prodFallback as any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allProducts: any[] = (finalProducts ?? []) as any[];

  // If vector search found similar products, bubble them to the front.
  if (options.priorityProductNames && options.priorityProductNames.length > 0) {
    const prioritySet = new Set(options.priorityProductNames.map(n => n.toLowerCase()));
    const prioritized = allProducts.filter((p: { name: string }) => prioritySet.has(p.name.toLowerCase()));
    const rest        = allProducts.filter((p: { name: string }) => !prioritySet.has(p.name.toLowerCase()));
    allProducts = [...prioritized, ...rest];
    console.info(`[loadBusinessContext] ${prioritized.length} priority products from vector search surfaced to top`);
  }

  // ── Build the explicit matched-products list ────────────────────────────────
  // This is the ONLY list the prompt may surface. It contains genuinely relevant
  // products in best-first order: vector matches → strong token matches → same-
  // category alternatives → (last) weak best-effort token hits. It is NEVER padded
  // with arbitrary catalog rows, so insertion-order items (e.g. the deity statues
  // created first) cannot leak into a response when retrieval finds few/no matches.
  //
  // STRONG_RETRIEVAL_SCORE tracks the scoring engine: a single category/description
  // token scores 2.5; two tokens or a full category/name match score >= 5; exact or
  // "name contains query" score 8–10. So < 5 means only a weak coincidental hit —
  // which must NOT be treated as a confident match, and must NOT suppress the
  // category fallback below.
  const STRONG_RETRIEVAL_SCORE = 5.0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byName = (name: string): any => allProducts.find((p: any) => p.name.toLowerCase() === name.toLowerCase());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matched: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushUnique = (p: any) => { if (p && !matched.some(m => m.name.toLowerCase() === p.name.toLowerCase())) matched.push(p); };

  let tokenRetrievalHitCount = 0;
  let categoryFallbackHitCount = 0;

  // 1. Vector priority (image similarity) — strongest signal.
  if (options.priorityProductNames?.length) {
    for (const n of options.priorityProductNames) pushUnique(byName(n));
  }

  // 2. Token retrieval — only when vector did not pre-filter. Confident matches are
  //    added; a weak top score is held aside (step 4) so it can be displaced by a
  //    proper category fallback first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let weakTokenHits: any[] = [];
  if (!options.priorityProductNames?.length && options.textQuery?.trim()) {
    const retrievalHits = retrieveProducts(allProducts, options.textQuery);
    const topScore = retrievalHits[0]?.score ?? 0;
    if (retrievalHits.length > 0) {
      const t = retrievalHits[0];
      console.info(`[loadBusinessContext] retrieval: ${retrievalHits.length} hit(s) for "${options.textQuery.slice(0, 40)}" — top "${t.name}" score=${topScore.toFixed(1)} conf=${t.confidence.toFixed(2)} reason=${t.reason}`);
    } else {
      console.info(`[loadBusinessContext] retrieval: no matches above threshold for "${options.textQuery.slice(0, 40)}"`);
    }
    if (topScore >= STRONG_RETRIEVAL_SCORE) {
      for (const h of retrievalHits) pushUnique(byName(h.name));
      tokenRetrievalHitCount = retrievalHits.length;
    } else {
      weakTokenHits = retrievalHits.map(h => byName(h.name)).filter(Boolean);
    }
  }

  // 3. Category-level fallback — now fires whenever no STRONG match exists yet
  //    (zero hits OR only weak hits). Surfaces same-category alternatives so a
  //    weak coincidental hit can no longer block "we don't have X, but here are
  //    other <category>" behaviour.
  if (matched.length === 0 && options.textQuery?.trim()) {
    const catPatterns = extractCategoryKeywords(options.textQuery);
    if (catPatterns) {
      const catHits = retrieveProductsByCategory(allProducts, catPatterns);
      if (catHits.length > 0) {
        categoryFallbackHitCount = catHits.length;
        for (const h of catHits) pushUnique(byName(h.name));
        console.info(`[loadBusinessContext] category-fallback: ${catHits.length} same-category alternative(s) for "${options.textQuery.slice(0, 40)}" patterns=[${catPatterns.slice(0, 3).join(', ')}]`);
      } else {
        console.info(`[loadBusinessContext] category-fallback: no products matched patterns [${catPatterns.slice(0, 3).join(', ')}]`);
      }
    }
  }

  // 4. Best-effort — if nothing else matched, surface the weak token hits (genuine
  //    field matches, just low score) rather than asking a needless clarifying
  //    question. These are real matches, NOT insertion-order padding.
  if (matched.length === 0 && weakTokenHits.length > 0) {
    for (const p of weakTokenHits) pushUnique(p);
    tokenRetrievalHitCount = weakTokenHits.length;
    console.info(`[loadBusinessContext] using ${weakTokenHits.length} weak token hit(s) as best-effort matches`);
  }

  return {
    products: allProducts,
    matchedProducts: matched,
    businessDescription,
    imageSearchQuery: options.imageSearchQuery ?? null,
    ...(tokenRetrievalHitCount   > 0 ? { tokenRetrievalHits:   tokenRetrievalHitCount   } : {}),
    ...(categoryFallbackHitCount > 0 ? { categoryFallbackHits: categoryFallbackHitCount } : {}),
  };
}
