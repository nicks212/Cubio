import { createClient } from '@/lib/supabase/server';
import ProductsClient from './ProductsClient';

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = profile?.company_id ?? '';

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return <ProductsClient products={products ?? []} />;
}
