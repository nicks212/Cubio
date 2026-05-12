'use client';

import { useState, useActionState } from 'react';
import { Users, Languages, Plug, Edit, Trash2, X, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  toggleUserAdmin, upsertLocalization, deleteLocalization,
  createIntegration, updateIntegration, deleteIntegration, toggleIntegration,
} from './actions';
import { formatDate } from '@/lib/utils';

type Tab = 'users' | 'localizations' | 'integrations';

const PROVIDERS = ['facebook', 'instagram', 'telegram', 'whatsapp', 'viber'] as const;
const providerIcons: Record<string, string> = { facebook: '📘', instagram: '📸', telegram: '✈️', whatsapp: '💬', viber: '📱' };

interface Props {
  users: Array<{ id: string; full_name: string | null; email: string | null; is_admin: boolean; created_at: string; company?: { company_name: string; business_type: string } | null }>;
  integrations: Array<{ id: string; company_id: string; provider: string; provider_account_id: string; account_name: string; access_token: string; refresh_token?: string | null; is_active: boolean; created_at: string; company?: { company_name: string } | null }>;
  localizations: Array<{ id: string; keyword: string; localization_text: string }>;
  companies: Array<{ id: string; company_name: string }>;
}

export default function AdminClient({ users, integrations, localizations, companies }: Props) {
  const [tab, setTab] = useState<Tab>('users');
  const [intModal, setIntModal] = useState(false);
  const [editingInt, setEditingInt] = useState<Props['integrations'][0] | null>(null);
  const [locModal, setLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Props['localizations'][0] | null>(null);

  const [intCreateState, intCreateAction, intCreatePending] = useActionState(createIntegration, null);
  const [intUpdateState, intUpdateAction, intUpdatePending] = useActionState(updateIntegration, null);
  const [locState, locAction, locPending] = useActionState(upsertLocalization, null);

  if ((editingInt ? intUpdateState : intCreateState)?.success && intModal) { setIntModal(false); setEditingInt(null); }
  if (locState?.success && locModal) { setLocModal(false); setEditingLoc(null); }

  const openEditInt = (i: Props['integrations'][0]) => { setEditingInt(i); setIntModal(true); };
  const openLocEdit = (l: Props['localizations'][0]) => { setEditingLoc(l); setLocModal(true); };

  const tabs = [
    { id: 'users' as Tab, label: 'Users', icon: Users },
    { id: 'localizations' as Tab, label: 'Localizations', icon: Languages },
    { id: 'integrations' as Tab, label: 'Integrations', icon: Plug },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Admin Panel</h1>
        <p className="text-muted-foreground">Manage users, content, and integrations</p>
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
                  {['Name', 'Email', 'Company', 'Business', 'Admin', 'Joined'].map(h => (
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
                        {u.is_admin ? 'Admin' : 'User'}
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
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditingLoc(null); setLocModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
              <Plus className="w-4 h-4" />Add String
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Key', 'Text', ''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localizations.map(loc => (
                    <tr key={loc.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-sm font-mono text-muted-foreground">{loc.keyword}</td>
                      <td className="py-3 px-4 text-sm">{loc.localization_text}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openLocEdit(loc)} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => deleteLocalization(loc.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
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
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h2 className="font-semibold text-blue-900 mb-1">Webhook URL</h2>
            <p className="text-sm text-blue-700 mb-3">Configure this URL in your messaging platform settings:</p>
            <code className="block bg-white border border-blue-200 rounded-lg px-4 py-3 text-sm font-mono text-blue-900 break-all">
              {process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cubio.ge'}/api/webhook/meta
            </code>
          </div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditingInt(null); setIntModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
              <Plus className="w-4 h-4" />Add Integration
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Provider', 'Company', 'Account', 'ID', 'Status', ''].map(h => (
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
                          {int.is_active ? 'Active' : 'Off'}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEditInt(int)} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => { if (confirm('Delete integration?')) deleteIntegration(int.id); }} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
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
              <h2 className="text-xl font-semibold">{editingInt ? 'Edit Integration' : 'Add Integration'}</h2>
              <button onClick={() => { setIntModal(false); setEditingInt(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editingInt ? intUpdateAction : intCreateAction} className="p-6 space-y-4">
              {editingInt && <input type="hidden" name="id" value={editingInt.id} />}
              {(editingInt ? intUpdateState : intCreateState)?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{(editingInt ? intUpdateState : intCreateState)?.error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Company *</label>
                <select name="company_id" defaultValue={editingInt?.company_id ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Select company...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Provider *</label>
                <select name="provider" defaultValue={editingInt?.provider ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Select provider...</option>
                  {PROVIDERS.map(p => <option key={p} value={p}>{providerIcons[p]} {p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Account Name *</label>
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
                <label htmlFor="modal_is_active" className="text-sm font-medium">Active</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIntModal(false); setEditingInt(null); }} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">Cancel</button>
                <button type="submit" disabled={editingInt ? intUpdatePending : intCreatePending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {(editingInt ? intUpdatePending : intCreatePending) ? 'Saving...' : 'Save'}
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
              <h2 className="text-xl font-semibold">{editingLoc ? 'Edit String' : 'Add String'}</h2>
              <button onClick={() => { setLocModal(false); setEditingLoc(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={locAction} className="p-6 space-y-4">
              {editingLoc && <input type="hidden" name="id" value={editingLoc.id} />}
              {locState?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{locState.error}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">Key *</label>
                <input name="keyword" required defaultValue={editingLoc?.keyword ?? ''} className="w-full px-4 py-2.5 font-mono bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Text *</label>
                <textarea name="localization_text" required rows={3} defaultValue={editingLoc?.localization_text ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setLocModal(false); setEditingLoc(null); }} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">Cancel</button>
                <button type="submit" disabled={locPending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {locPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
