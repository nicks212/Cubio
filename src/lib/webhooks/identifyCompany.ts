import { createAdminClient } from '@/lib/supabase/server';
import type { Provider, ResolvedIntegration } from './types';

/**
 * Looks up the integration row in the DB for a given provider + providerAccountId.
 * Returns null if not found or inactive.
 */
export async function identifyCompany(
  provider: Provider,
  providerAccountId: string,
): Promise<ResolvedIntegration | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('integrations')
    .select(`
      id,
      company_id,
      provider,
      provider_account_id,
      access_token,
      refresh_token,
      is_active,
      company:companies (
        id,
        business_type,
        ai_enabled
      )
    `)
    .eq('provider', provider)
    .eq('provider_account_id', providerAccountId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.warn(`[identifyCompany] No active integration for ${provider}/${providerAccountId}:`, error?.message);
    return null;
  }

  const company = (data.company as unknown) as { id: string; business_type: string; ai_enabled: boolean } | null;
  if (!company) {
    console.warn(`[identifyCompany] Integration ${data.id} has no linked company`);
    return null;
  }

  return {
    integrationId: data.id as string,
    companyId: company.id,
    businessType: company.business_type as 'real_estate' | 'craft_shop',
    aiEnabled: company.ai_enabled,
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | null,
    provider: data.provider as Provider,
    providerAccountId: data.provider_account_id as string,
  };
}

/**
 * For providers like Telegram where incoming webhooks don't carry the account ID,
 * look up by provider only — matches the FIRST active integration found.
 * For multi-bot setups, the adapter must pass the bot token-derived account ID instead.
 */
export async function identifyCompanyByProviderOnly(
  provider: Provider,
): Promise<ResolvedIntegration | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('integrations')
    .select(`
      id,
      company_id,
      provider,
      provider_account_id,
      access_token,
      refresh_token,
      is_active,
      company:companies (
        id,
        business_type,
        ai_enabled
      )
    `)
    .eq('provider', provider)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn(`[identifyCompanyByProviderOnly] No active integration for ${provider}:`, error?.message);
    return null;
  }

  const company = (data.company as unknown) as { id: string; business_type: string; ai_enabled: boolean } | null;
  if (!company) return null;

  return {
    integrationId: data.id as string,
    companyId: company.id,
    businessType: company.business_type as 'real_estate' | 'craft_shop',
    aiEnabled: company.ai_enabled,
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | null,
    provider: data.provider as Provider,
    providerAccountId: data.provider_account_id as string,
  };
}
