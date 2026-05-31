import { createAdminClient } from '@/lib/supabase/server';
import type { BusinessContext } from '@/lib/ai';
import { retrieveProducts } from '@/lib/ai/productRetrieval';

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

  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('name, price, currency, category, zodiac_compatibility, birthstones, material, in_stock, images, description')
    .eq('company_id', companyId)
    .eq('in_stock', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  // Fallback: if `currency` column doesn't exist yet (migration pending), retry without it
  let finalProducts = products;
  if (prodError) {
    console.warn('[loadBusinessContext] product query failed, retrying without currency:', prodError.message);
    const { data: prodFallback } = await supabase
      .from('products')
      .select('name, price, category, zodiac_compatibility, birthstones, material, in_stock, images, description')
      .eq('company_id', companyId)
      .eq('in_stock', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });
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

  // Deterministic text retrieval — catches romanized/transliterated queries that
  // vector search may miss (e.g. "taro" vs ტარო, "silver ring" vs ვერცხლის ბეჭედი).
  // Runs ONLY when vector search found nothing — vector is primary, token is fallback.
  // If vector already returned matches, those are already at the front; running token
  // retrieval on top would mix a 3rd ranking signal and potentially displace better matches.
  if (!options.priorityProductNames?.length && options.textQuery?.trim()) {
    const retrievalHits = retrieveProducts(allProducts, options.textQuery);
    if (retrievalHits.length > 0) {
      const top = retrievalHits[0];
      console.info(
        `[loadBusinessContext] retrieval: ${retrievalHits.length} match(es) for "${options.textQuery.slice(0, 40)}" — top: "${top.name}" (conf: ${top.confidence.toFixed(2)}, reason: ${top.reason})`,
      );
      // Add retrieval hits that are not already in the current top priority slots
      const currentTopNames = new Set(
        allProducts.slice(0, Math.max(options.priorityProductNames?.length ?? 0, 1)).map(
          (p: { name: string }) => p.name.toLowerCase(),
        ),
      );
      const newPriority = retrievalHits
        .filter(r => !currentTopNames.has(r.name.toLowerCase()))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(r => allProducts.find((p: any) => p.name === r.name))
        .filter(Boolean) as typeof allProducts;
      if (newPriority.length > 0) {
        const alreadyTop = allProducts.filter((p: { name: string }) => currentTopNames.has(p.name.toLowerCase()));
        const others     = allProducts.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => !currentTopNames.has(p.name.toLowerCase()) && !newPriority.find((n: any) => n.name === p.name),
        );
        allProducts = [...alreadyTop, ...newPriority, ...others];
        console.info(`[loadBusinessContext] retrieval promoted ${newPriority.length} product(s) to priority front`);
      }
    } else {
      console.info(`[loadBusinessContext] retrieval: no matches above threshold for "${options.textQuery.slice(0, 40)}"`);
    }
  }

  return { products: allProducts, businessDescription, imageSearchQuery: options.imageSearchQuery ?? null };
}
