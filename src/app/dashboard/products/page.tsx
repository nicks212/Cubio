import { createClient } from '@/lib/supabase/server';
import type { BusinessType } from '@/types/database';
import ProductsClient from './ProductsClient';

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = profile?.company_id ?? '';

  const [{ data: products }, { data: categories }, { data: company }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('product_categories')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name', { ascending: true }),
    supabase.from('companies').select('business_type').eq('id', companyId).single(),
  ]);

  const businessType = (company?.business_type ?? null) as BusinessType | null;

  return (
    <ProductsClient
      products={products ?? []}
      initialCategories={categories?.map(c => c.name) ?? []}
      companyId={companyId}
      businessType={businessType}
    />
  );
}
