import { createAdminClient } from '@/lib/supabase/server';
import type { BusinessContext } from '@/lib/ai';

/** Options for context loading — used when vector similarity search pre-filtered results. */
export interface LoadContextOptions {
  /** Apartment numbers from vector search — these will be sorted to the top. */
  priorityApartmentNumbers?: string[];
  /** Product names from vector search — these will be sorted to the top. */
  priorityProductNames?: string[];
  /** Text query from image description — used for tighter text-based pre-filter fallback. */
  imageSearchQuery?: string;
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
    .select('name, price, currency, category, zodiac_compatibility, birthstones, material, in_stock, images')
    .eq('company_id', companyId)
    .eq('in_stock', true)
    .is('deleted_at', null)
    .limit(30);

  // Fallback: if `currency` column doesn't exist yet (migration pending), retry without it
  let finalProducts = products;
  if (prodError) {
    console.warn('[loadBusinessContext] product query failed, retrying without currency:', prodError.message);
    const { data: prodFallback } = await supabase
      .from('products')
      .select('name, price, category, zodiac_compatibility, birthstones, material, in_stock, images')
      .eq('company_id', companyId)
      .eq('in_stock', true)
      .is('deleted_at', null)
      .limit(30);
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

  return { products: allProducts, businessDescription };
}
