import { createClient } from '@/lib/supabase/server';

const providerLabels: Record<string, string> = {
  facebook: 'Facebook Messenger',
  instagram: 'Instagram DM',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
};

const providerIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📸',
  telegram: '✈️',
  whatsapp: '💬',
  viber: '📱',
};

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('company_id', profile?.company_id ?? '')
    .order('created_at', { ascending: false });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Integrations</h1>
        <p className="text-muted-foreground">Messaging channels connected to your AI assistant</p>
      </div>

      {(!integrations || integrations.length === 0) ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-4xl mb-4">🔌</p>
          <p className="font-semibold mb-2">No integrations configured</p>
          <p className="text-muted-foreground text-sm">Contact your administrator to set up messaging integrations.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {integrations.map(integration => (
            <div key={integration.id} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl">
                  {providerIcons[integration.provider] ?? '💬'}
                </div>
                <div>
                  <h3 className="font-semibold">{providerLabels[integration.provider] ?? integration.provider}</h3>
                  <p className="text-sm text-muted-foreground">{integration.account_name}</p>
                </div>
                <div className="ml-auto">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${integration.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {integration.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-muted-foreground">Account ID: {integration.provider_account_id}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h2 className="font-semibold text-blue-900 mb-2">Webhook URL</h2>
        <p className="text-sm text-blue-700 mb-3">Use this URL when configuring webhooks in your messaging platform:</p>
        <code className="block bg-white border border-blue-200 rounded-lg px-4 py-3 text-sm font-mono text-blue-900 break-all">
          {process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cubio.ge'}/api/webhook/meta
        </code>
      </div>
    </div>
  );
}
