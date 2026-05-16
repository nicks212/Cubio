import { createAdminClient } from '@/lib/supabase/server';
import type { BusinessContext } from '@/lib/ai';

/**
 * Loads the appropriate business context data for the AI
 * based on the company's business type, including the optional
 * business_description the company owner wrote during onboarding/settings.
 */
export async function loadBusinessContext(
  companyId: string,
  businessType: 'real_estate' | 'craft_shop',
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
    const { data: apartments } = await supabase
      .from('apartments')
      .select('apartment_number, size_sq_m, floor, rooms_quantity, price_per_sq_m, total_price, status, project:projects(name)')
      .eq('company_id', companyId)
      .eq('status', 'vacant')
      .is('deleted_at', null)
      .order('floor', { ascending: true })
      .limit(30);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { apartments: (apartments ?? []) as any, businessDescription };
  }

  const { data: products } = await supabase
    .from('products')
    .select('name, price, category, zodiac_compatibility, birthstones, material, in_stock')
    .eq('company_id', companyId)
    .eq('in_stock', true)
    .is('deleted_at', null)
    .limit(30);

  return { products: products ?? [], businessDescription };
}
