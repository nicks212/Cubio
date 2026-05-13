'use client';

import { useState, useActionState } from 'react';
import { Users, Languages, Plug, Edit, Trash2, X, Plus, ToggleLeft, ToggleRight, RotateCcw, Search } from 'lucide-react';
import {
  toggleUserAdmin, upsertLocalization, deleteLocalization,
  createIntegration, updateIntegration, deleteIntegration, toggleIntegration,
} from './actions';
import { formatDate } from '@/lib/utils';
import { useT } from '@/components/TranslationsProvider';

type Tab = 'users' | 'localizations' | 'integrations';

const PROVIDERS = ['facebook', 'instagram', 'telegram', 'whatsapp', 'viber'] as const;
const providerIcons: Record<string, string> = { facebook: '📘', instagram: '📸', telegram: '✈️', whatsapp: '💬', viber: '📱' };

interface Props {
  users: Array<{ id: string; full_name: string | null; email: string | null; is_admin: boolean; created_at: string; company?: { company_name: string; business_type: string } | null }>;
  integrations: Array<{ id: string; company_id: string; provider: string; provider_account_id: string; account_name: string; access_token: string; refresh_token?: string | null; is_active: boolean; created_at: string; company?: { company_name: string } | null }>;
  localizations: Array<{ id: string | null; keyword: string; localization_text: string }>;
  companies: Array<{ id: string; company_name: string }>;
}

export default function AdminClient({ users, integrations, localizations, companies }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('users');
  const [intModal, setIntModal] = useState(false);
  const [editingInt, setEditingInt] = useState<Props['integrations'][0] | null>(null);
  const [locModal, setLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Props['localizations'][0] | null>(null);
  const [locSearch, setLocSearch] = useState('');

  const [intCreateState, intCreateAction, intCreatePending] = useActionState(createIntegration, null);
  const [intUpdateState, intUpdateAction, intUpdatePending] = useActionState(updateIntegration, null);
  const [locState, locAction, locPending] = useActionState(upsertLocalization, null);

  if ((editingInt ? intUpdateState : intCreateState)?.success && intModal) { setIntModal(false); setEditingInt(null); }
  if (locState?.success && locModal) { setLocModal(false); setEditingLoc(null); }

  const openEditInt = (i: Props['integrations'][0]) => { setEditingInt(i); setIntModal(true); };
  const openLocEdit = (l: Props['localizations'][0]) => { setEditingLoc(l); setLocModal(true); };

  const filterLocalizations = (query: string) => {
    if (!query.trim()) return localizations;
    const q = query.toLowerCase();
    return localizations.filter(loc => {
      const keyword = loc.keyword.toLowerCase();
      const text = loc.localization_text.toLowerCase();
      return keyword.startsWith(q) || text.startsWith(q) || keyword.includes(q) || text.includes(q);
    });
  };

  const filteredLocalizations = filterLocalizations(locSearch);

  const tabs = [
    { id: 'users' as Tab, label: t['admin.tab_users'] ?? 'Users', icon: Users },
    { id: 'localizations' as Tab, label: t['admin.tab_localizations'] ?? 'Localizations', icon: Languages },
    { id: 'integrations' as Tab, label: t['admin.tab_integrations'] ?? 'Integrations', icon: Plug },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t['admin.title']}</h1>
        <p className="text-muted-foreground">{t['admin.subtitle']}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {[t['admin.col_name'], t['admin.col_email'], t['admin.col_company'], t['admin.col_business'], t['admin.col_admin'], t['admin.col_joined']].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-sm">{u.full_name ?? '—'}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{u.email}</td>
                    <td className="py-3 px-4 text-sm">{u.company?.company_name ?? '—'}</td>
                    <td className="py-3 px-4 text-sm capitalize">{u.company?.business_type ?? '—'}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleUserAdmin(u.id, !u.is_admin)}
                        className={`flex items-center gap-1 text-sm font-medium transition-colors ${u.is_admin ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        {u.is_admin ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        {u.is_admin ? t['admin.is_admin'] : t['admin.is_user']}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Localizations Tab */}
      {tab === 'localizations' && (
        <>
          <div className="mb-4 space-y-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-200">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={locSearch}
                onChange={(e) => setLocSearch(e.target.value)}
                placeholder={t['admin.search_localizations'] ?? 'Search keywords or text...'}
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filteredLocalizations.length} {t['admin.strings_count']} {locSearch && `(${localizations.length} total)`}</p>
              <button onClick={() => { setEditingLoc(null); setLocModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
                <Plus className="w-4 h-4" />{t['admin.add_string']}
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground w-64">{t['admin.col_key']}</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{t['admin.col_text']}</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLocalizations.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 px-4 text-center text-muted-foreground">
                        {locSearch ? (t['admin.no_results'] ?? 'No localizations found') : (t['admin.no_strings'] ?? 'No localizations yet')}
                      </td>
                    </tr>
                  ) : filteredLocalizations.map(loc => (
                    <tr key={loc.keyword} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-xs font-mono text-muted-foreground align-top pt-4">{loc.keyword}</td>
                      <td className="py-3 px-4 text-sm">{loc.localization_text}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openLocEdit(loc)} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground" title={t['admin.edit_string']}><Edit className="w-4 h-4" /></button>
                          {loc.id && (
                            <button onClick={() => deleteLocalization(loc.id!)} className="p-1.5 hover:bg-amber-50 rounded text-amber-500" title={t['admin.reset_to_default']}><RotateCcw className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Integrations Tab */}
      {tab === 'integrations' && (
        <>
          {/* Webhook URLs */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h2 className="font-semibold text-blue-900 mb-1">{t['admin.webhook_title']}</h2>
            <p className="text-sm text-blue-700 mb-4">{t['admin.webhook_desc']}</p>
            <div className="space-y-2">
              {[
                { label: 'Meta (Facebook + Instagram)', path: '/api/webhook/meta', icon: '📘' },
                { label: 'Telegram', path: '/api/webhook/telegram', icon: '✈️' },
                { label: 'WhatsApp', path: '/api/webhook/whatsapp', icon: '💬' },
                { label: 'Viber', path: '/api/webhook/viber', icon: '📱' },
              ].map(({ label, path, icon }) => {
                const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cubio.ge'}${path}`;
                return (
                  <div key={path} className="flex items-center gap-3 bg-white border border-blue-200 rounded-lg px-4 py-2.5">
                    <span className="text-base flex-shrink-0">{icon}</span>
                    <span className="text-xs font-medium text-blue-800 w-44 flex-shrink-0">{label}</span>
                    <code className="flex-1 text-xs font-mono text-blue-900 break-all">{url}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      title="Copy"
                    >
                      {t['admin.copy'] ?? 'Copy'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditingInt(null); setIntModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
              <Plus className="w-4 h-4" />{t['admin.add_integration']}
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {[t['admin.col_provider'], t['admin.col_company'], t['admin.col_account'], t['admin.col_id'], t['admin.col_status'], ''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {integrations.map(int => (
                    <tr key={int.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {providerIcons[int.provider]} {int.provider}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">{int.company?.company_name}</td>
                      <td className="py-3 px-4 text-sm">{int.account_name}</td>
                      <td className="py-3 px-4 text-xs font-mono text-muted-foreground">{int.provider_account_id}</td>
                      <td className="py-3 px-4">
                        <button onClick={() => toggleIntegration(int.id, !int.is_active)} className={`flex items-center gap-1 text-sm font-medium transition-colors ${int.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {int.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          {int.is_active ? (t['admin.active'] ?? 'Active') : (t['admin.off'] ?? 'Off')}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEditInt(int)} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => { if (confirm(t['admin.delete_confirm'] ?? 'Delete integration?')) deleteIntegration(int.id); }} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Integration Modal */}
      {intModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{editingInt ? (t['admin.edit_integration'] ?? 'Edit Integration') : (t['admin.add_integration'] ?? 'Add Integration')}</h2>
              <button onClick={() => { setIntModal(false); setEditingInt(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editingInt ? intUpdateAction : intCreateAction} className="p-6 space-y-4">
              {editingInt && <input type="hidden" name="id" value={editingInt.id} />}
              {(editingInt ? intUpdateState : intCreateState)?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{(editingInt ? intUpdateState : intCreateState)?.error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">{t['admin.col_company'] ?? 'Company'} *</label>
                <select name="company_id" defaultValue={editingInt?.company_id ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">{t['admin.company_select'] ?? 'Select company...'}</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t['admin.col_provider'] ?? 'Provider'} *</label>
                <select name="provider" defaultValue={editingInt?.provider ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">{t['admin.provider_select'] ?? 'Select provider...'}</option>
                  {PROVIDERS.map(p => <option key={p} value={p}>{providerIcons[p]} {p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t['admin.account_name'] ?? 'Account Name'} *</label>
                <input name="account_name" required defaultValue={editingInt?.account_name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Provider Account ID *</label>
                <input name="provider_account_id" required defaultValue={editingInt?.provider_account_id ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Access Token *</label>
                <input name="access_token" required defaultValue={editingInt?.access_token ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Refresh Token</label>
                <input name="refresh_token" defaultValue={editingInt?.refresh_token ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" name="is_active" id="modal_is_active" value="true" defaultChecked={editingInt?.is_active ?? true} className="w-4 h-4 accent-primary" />
                <label htmlFor="modal_is_active" className="text-sm font-medium">{t['admin.is_active_label'] ?? 'Active'}</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIntModal(false); setEditingInt(null); }} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t['admin.cancel'] ?? 'Cancel'}</button>
                <button type="submit" disabled={editingInt ? intUpdatePending : intCreatePending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {(editingInt ? intUpdatePending : intCreatePending) ? (t['admin.saving'] ?? 'Saving...') : (t['admin.save'] ?? 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Localization Modal */}
      {locModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{editingLoc ? (t['admin.edit_string'] ?? 'Edit String') : (t['admin.add_string'] ?? 'Add String')}</h2>
              <button onClick={() => { setLocModal(false); setEditingLoc(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={locAction} className="p-6 space-y-4">
              {locState?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{locState.error}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">{t['admin.key_label'] ?? 'Key'} *</label>
                {editingLoc ? (
                  <>
                    <input type="hidden" name="keyword" value={editingLoc.keyword} />
                    <div className="w-full px-4 py-2.5 font-mono text-sm bg-slate-100 border border-border rounded-lg text-muted-foreground">{editingLoc.keyword}</div>
                  </>
                ) : (
                  <input name="keyword" required defaultValue="" className="w-full px-4 py-2.5 font-mono bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t['admin.text_label'] ?? 'Text'} *</label>
                <textarea name="localization_text" required rows={3} defaultValue={editingLoc?.localization_text ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setLocModal(false); setEditingLoc(null); }} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t['admin.cancel'] ?? 'Cancel'}</button>
                <button type="submit" disabled={locPending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {locPending ? (t['admin.saving'] ?? 'Saving...') : (t['admin.save'] ?? 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
