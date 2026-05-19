'use client';

import { useState } from 'react';
import { Facebook, Mail, Send, MessageCircle, Phone, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useT } from '@/components/TranslationsProvider';

type Provider = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  hidden?: boolean;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenHint: string;
  needsManualAccountId?: boolean;
  accountIdLabel?: string;
  accountIdPlaceholder?: string;
  helpUrl?: string;
};

const PROVIDERS: Provider[] = [
  {
    id: 'facebook',
    name: 'Facebook Messenger',
    icon: Facebook,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    tokenLabel: 'Page Access Token',
    tokenPlaceholder: 'EAAxxxx...',
    tokenHint: 'Generate from Meta App Dashboard → Messenger → Generate Access Tokens',
    helpUrl: 'https://developers.facebook.com/docs/messenger-platform/getting-started/quick-start',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Mail,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    tokenLabel: 'Instagram Page Access Token',
    tokenPlaceholder: 'EAAxxxx...',
    tokenHint: 'Generate from Meta App Dashboard → Instagram → Generate Access Tokens',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: Send,
    color: 'text-sky-500',
    bgColor: 'bg-sky-50',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: '123456789:ABCDEFxxxx...',
    tokenHint: 'Create a bot with @BotFather on Telegram and copy the token',
    helpUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    hidden: true,
    tokenLabel: 'Access Token',
    tokenPlaceholder: 'EAAxxxx...',
    tokenHint: 'WhatsApp Business API access token from Meta Cloud API',
    needsManualAccountId: true,
    accountIdLabel: 'Phone Number ID',
    accountIdPlaceholder: '1234567890',
  },
  {
    id: 'viber',
    name: 'Viber',
    icon: Phone,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    hidden: true,
    tokenLabel: 'Auth Token',
    tokenPlaceholder: 'xxxxxxxx-xxxx-xxxx...',
    tokenHint: 'Viber Public Account auth token from admin panel',
    needsManualAccountId: true,
    accountIdLabel: 'Account ID',
    accountIdPlaceholder: 'your-viber-account-id',
  },
];

interface IntegrationRow {
  provider: string;
  account_name: string;
  provider_account_id?: string;
  is_active: boolean;
}

interface Props {
  integrations: IntegrationRow[];
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IntegrationsClient({ integrations }: Props) {
  const t = useT();
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; failed: number; errors?: string[] } | null>(null);

  const byProvider = new Map(integrations.map(i => [i.provider, i]));
  const visibleProviders = PROVIDERS.filter(p => !p.hidden);

  const hasMetaIntegration = integrations.some(i => i.provider === 'facebook' || i.provider === 'instagram');

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/admin/backfill-names', { method: 'POST' });
      const json = await res.json() as { updated: number; failed: number; errors?: string[] };
      setBackfillResult(json);
    } catch {
      setBackfillResult({ updated: 0, failed: -1 });
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Integrations</h1>
        <p className="text-muted-foreground">Connect your messaging channels so the AI can respond to customers.</p>
      </div>

      {/* Contact notice */}
      <div className="mb-6 flex items-start gap-3 px-4 py-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
        <span className="text-base leading-none mt-0.5">📧</span>
        <span>{t('integrations.contact_notice')}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleProviders.map(provider => {
          const row = byProvider.get(provider.id);
          const connected = !!row && row.is_active;
          const Icon = provider.icon;

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 ${provider.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${provider.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{provider.name}</p>
                  {connected && row?.account_name && (
                    <p className="text-xs text-slate-500 truncate">{row.account_name}</p>
                  )}
                </div>
              </div>

              <div className="mt-auto">
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    {t('integrations.connected')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                    {t('integrations.not_connected')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Backfill contact names for existing conversations */}
      {hasMetaIntegration && (
        <div className="mt-8 p-5 bg-white border border-slate-200 rounded-xl">
          <h2 className="text-sm font-semibold text-foreground mb-1">Fix Unknown Contact Names</h2>
          <p className="text-xs text-slate-500 mb-3">
            Re-fetch display names from Facebook/Instagram for conversations that were saved as "Unknown".
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {backfilling && <Loader2 className="w-4 h-4 animate-spin" />}
              {backfilling ? 'Running...' : 'Backfill Names'}
            </button>
            {backfillResult && (
              <div className="flex flex-col gap-1">
                <span className={`text-xs ${backfillResult.failed === -1 ? 'text-red-600' : 'text-slate-600'}`}>
                  {backfillResult.failed === -1
                    ? 'Request failed'
                    : `Updated ${backfillResult.updated} record(s)${backfillResult.failed > 0 ? `, ${backfillResult.failed} failed` : ''}`}
                </span>
                {backfillResult.errors && backfillResult.errors.length > 0 && (
                  <div className="text-xs text-red-600 max-w-sm space-y-0.5">
                    {backfillResult.errors.slice(0, 3).map((e, i) => (
                      <p key={i} className="break-all">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
