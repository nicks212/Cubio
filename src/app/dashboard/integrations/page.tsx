import { createClient } from '@/lib/supabase/server';
import { Facebook, Mail, Send, MessageCircle, Phone } from 'lucide-react';
import { getTranslations } from '@/lib/i18n';
import type { LucideIcon } from 'lucide-react';

type Provider = { id: string; name: string; icon: LucideIcon; color: string; hidden?: boolean };

const PROVIDERS: Provider[] = [
  { id: 'facebook',  name: 'Facebook',  icon: Facebook,      color: 'text-blue-600'   },
  { id: 'instagram', name: 'Instagram', icon: Mail,          color: 'text-pink-600'   },
  { id: 'telegram',  name: 'Telegram',  icon: Send,          color: 'text-sky-500'    },
  { id: 'whatsapp',  name: 'WhatsApp',  icon: MessageCircle, color: 'text-green-600',  hidden: true },
  { id: 'viber',     name: 'Viber',     icon: Phone,         color: 'text-purple-600', hidden: true },
];

export default async function IntegrationsPage() {
  const [t, supabase] = await Promise.all([getTranslations(), createClient()]);
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
        <h1 className="text-3xl font-bold text-foreground mb-2">{t['integrations.title']}</h1>
        <p className="text-muted-foreground">{t['integrations.subtitle']}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-sm sm:max-w-none">
        {PROVIDERS.filter(p => !p.hidden).map(provider => {
          const row = byProvider.get(provider.id);
          const connected = !!row && row.is_active;
          const inactive  = !!row && !row.is_active;
          const Icon = provider.icon;

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center text-center gap-2">
              <div className={`w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 ${provider.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight">{provider.name}</p>
              {connected ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {t['integrations.connected']}
                </span>
              ) : inactive ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  {t['integrations.inactive']}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                  {t['integrations.not_connected']}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
