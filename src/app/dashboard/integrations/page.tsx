import { createClient } from '@/lib/supabase/server';
import { Facebook, Mail, Send, MessageCircle, Phone } from 'lucide-react';

const ALL_PROVIDERS = [
  { id: 'facebook',  label: 'Facebook Messenger', icon: Facebook, color: 'text-blue-600' },
  { id: 'instagram', label: 'Instagram DM',        icon: Mail, color: 'text-pink-600' },
  { id: 'telegram',  label: 'Telegram',            icon: Send, color: 'text-sky-500' },
  { id: 'whatsapp',  label: 'WhatsApp',            icon: MessageCircle, color: 'text-green-600' },
  { id: 'viber',     label: 'Viber',               icon: Phone, color: 'text-purple-600' },
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {ALL_PROVIDERS.map(provider => {
          const row = byProvider.get(provider.id);
          const connected = !!row && row.is_active;
          const inactive  = !!row && !row.is_active;
          const Icon = provider.icon;

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center text-center gap-4 min-h-[280px] justify-between">
              <div className={`w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center flex-shrink-0 ${provider.color}`}>
                <Icon className="w-8 h-8" />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center">
                <p className="font-semibold text-base text-foreground">{provider.label}</p>
                {connected && (
                  <p className="text-xs text-muted-foreground mt-2">{row.account_name}</p>
                )}
              </div>
              {connected ? (
                <span className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full font-medium bg-green-100 text-green-700">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Connected
                </span>
              ) : inactive ? (
                <span className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full font-medium bg-amber-100 text-amber-700">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Inactive
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full font-medium bg-slate-100 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                  Not connected
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
