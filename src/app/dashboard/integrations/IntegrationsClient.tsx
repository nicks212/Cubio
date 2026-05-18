'use client';

import { useState, useActionState, useEffect } from 'react';
import { Facebook, Mail, Send, MessageCircle, Phone, X, CheckCircle, AlertCircle, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { saveIntegration, deleteIntegration } from './actions';
import type { LucideIcon } from 'lucide-react';

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

// ── Connect Modal ─────────────────────────────────────────────────────────────
function ConnectModal({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveIntegration, null);

  useEffect(() => {
    if (state?.success) {
      setTimeout(onClose, 1200);
    }
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${provider.bgColor} rounded-xl flex items-center justify-center`}>
              <provider.icon className={`w-5 h-5 ${provider.color}`} />
            </div>
            <h2 className="text-lg font-semibold">Connect {provider.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form action={action} className="p-6 space-y-4">
          <input type="hidden" name="provider" value={provider.id} />

          <div>
            <label className="block text-sm font-medium mb-1.5">{provider.tokenLabel}</label>
            <input
              name="access_token"
              required
              placeholder={provider.tokenPlaceholder}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-slate-500 mt-1.5">{provider.tokenHint}</p>
          </div>

          {provider.needsManualAccountId && (
            <div>
              <label className="block text-sm font-medium mb-1.5">{provider.accountIdLabel}</label>
              <input
                name="provider_account_id"
                required
                placeholder={provider.accountIdPlaceholder}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">Account Name <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              name="account_name"
              placeholder="My Page / Bot name"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-slate-500 mt-1.5">Leave blank to auto-detect from the token</p>
          </div>

          {provider.helpUrl && (
            <a
              href={provider.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              How to get a token
            </a>
          )}

          {state?.error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{state.error}</p>
            </div>
          )}

          {state?.success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700">Connected successfully!</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !!state?.success}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              {pending ? 'Connecting...' : state?.success ? 'Connected!' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Disconnect Confirm Modal ──────────────────────────────────────────────────
function DisconnectModal({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteIntegration, null);

  useEffect(() => {
    if (state?.success) setTimeout(onClose, 800);
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Disconnect {provider.name}?</h2>
            <p className="text-xs text-slate-500">The bot will stop responding on this channel.</p>
          </div>
        </div>

        {state?.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">{state.error}</div>
        )}

        <form action={action} className="flex gap-3">
          <input type="hidden" name="provider" value={provider.id} />
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {pending ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IntegrationsClient({ integrations }: Props) {
  const [connectingProvider, setConnectingProvider] = useState<Provider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<Provider | null>(null);
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

              <div className="flex items-center justify-between mt-auto">
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                    Not connected
                  </span>
                )}

                <div className="flex gap-2">
                  {connected && (
                    <button
                      onClick={() => setDisconnectingProvider(provider)}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                      title="Disconnect"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setConnectingProvider(provider)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      connected
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-primary text-white hover:bg-primary/90'
                    }`}
                  >
                    {connected ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {connectingProvider && (
        <ConnectModal
          provider={connectingProvider}
          onClose={() => setConnectingProvider(null)}
        />
      )}

      {disconnectingProvider && (
        <DisconnectModal
          provider={disconnectingProvider}
          onClose={() => setDisconnectingProvider(null)}
        />
      )}

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
