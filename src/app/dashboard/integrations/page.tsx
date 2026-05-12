import { createClient } from '@/lib/supabase/server';

const ALL_PROVIDERS = [
  { id: 'facebook',  label: 'Facebook Messenger', icon: '📘' },
  { id: 'instagram', label: 'Instagram DM',        icon: '📸' },
  { id: 'telegram',  label: 'Telegram',            icon: '✈️' },
  { id: 'whatsapp',  label: 'WhatsApp',            icon: '💬' },
  { id: 'viber',     label: 'Viber',               icon: '📱' },
] as const;

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const { data: integrations } = await supabase
    .from('integrations')
    .select('provider, account_name, is_active')
    .eq('company_id', profile?.company_id ?? '');

  // Build a map: provider → integration row (if it exists)
  const byProvider = new Map((integrations ?? []).map(i => [i.provider, i]));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Integrations</h1>
        <p className="text-muted-foreground">Messaging channels connected to your AI assistant</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ALL_PROVIDERS.map(provider => {
          const row = byProvider.get(provider.id);
          const connected = !!row && row.is_active;
          const inactive  = !!row && !row.is_active;

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                {provider.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{provider.label}</p>
                {connected && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{row.account_name}</p>
                )}
              </div>
              <div className="flex-shrink-0">
                {connected ? (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Connected
                  </span>
                ) : inactive ? (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    Inactive
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                    Not connected
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
