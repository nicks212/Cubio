'use client';

import { useState, useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, X, UserCog, Tag, Layers } from 'lucide-react';
import {
  createSpecialist, updateSpecialist, deleteSpecialist,
  createSpecialistType, deleteSpecialistType, createCategory, deleteCategory,
} from './actions';
import { useT } from '@/components/TranslationsProvider';

interface NamedRow { id: string; name: string; }
interface Specialist {
  id: string;
  specialist_name: string;
  specialist_type_id: string | null;
  languages: string[] | null;
  active: boolean;
  specialist_type?: { name: string } | { name: string }[] | null;
}

interface Props {
  specialists: Specialist[];
  specialistTypes: NamedRow[];
  categories: NamedRow[];
}

type Tab = 'specialists' | 'types' | 'categories';

export default function SpecialistsClient({ specialists, specialistTypes, categories }: Props) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('specialists');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Specialist | null>(null);

  const [createState, createAction, createPending] = useActionState(createSpecialist, null);
  const [updateState, updateAction, updatePending] = useActionState(updateSpecialist, null);
  const state = editing ? updateState : createState;
  if (state?.success && modal) { setModal(false); setEditing(null); }

  const typeName = (s: Specialist) =>
    Array.isArray(s.specialist_type) ? (s.specialist_type[0]?.name ?? '—') : (s.specialist_type?.name ?? '—');

  const inputCls = 'w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50';

  const tabs: Array<{ id: Tab; label: string; icon: typeof UserCog }> = [
    { id: 'specialists', label: t['specialists.tab_specialists'] ?? 'Specialists', icon: UserCog },
    { id: 'types', label: t['specialists.tab_types'] ?? 'Specialist Types', icon: Tag },
    { id: 'categories', label: t['specialists.tab_categories'] ?? 'Categories', icon: Layers },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
          <UserCog className="w-7 h-7 text-primary" />{t['specialists.title'] ?? 'Specialists'}
        </h1>
        <p className="text-muted-foreground">{t['specialists.subtitle'] ?? 'Manage your specialists, their types, and service categories.'}</p>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-8 w-fit">
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${tab === tb.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <tb.icon className="w-4 h-4" />{tb.label}
          </button>
        ))}
      </div>

      {tab === 'specialists' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditing(null); setModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
              <Plus className="w-4 h-4" />{t['specialists.add'] ?? 'Add Specialist'}
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {[t['specialists.col_name'] ?? 'Name', t['specialists.col_type'] ?? 'Type', t['specialists.col_languages'] ?? 'Languages', t['specialists.col_status'] ?? 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {specialists.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground text-sm">{t['specialists.empty'] ?? 'No specialists yet.'}</td></tr>
                ) : specialists.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm font-medium">{s.specialist_name}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{typeName(s)}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{(s.languages ?? []).join(', ') || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.active ? (t['services.active'] ?? 'Active') : (t['services.inactive'] ?? 'Inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditing(s); setModal(true); }} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm(t['specialists.delete_confirm'] ?? 'Delete this specialist?')) deleteSpecialist(s.id); }} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'types' && (
        <NamedListEditor
          rows={specialistTypes}
          placeholder={t['specialists.type_placeholder'] ?? 'e.g. Nail Specialist'}
          emptyLabel={t['specialists.types_empty'] ?? 'No specialist types yet.'}
          onAdd={async (name) => { await createSpecialistType(name); router.refresh(); }}
          onDelete={async (id) => { await deleteSpecialistType(id); router.refresh(); }}
        />
      )}

      {tab === 'categories' && (
        <NamedListEditor
          rows={categories}
          placeholder={t['specialists.category_placeholder'] ?? 'e.g. Hair Styling'}
          emptyLabel={t['specialists.categories_empty'] ?? 'No categories yet.'}
          onAdd={async (name) => { await createCategory(name); router.refresh(); }}
          onDelete={async (id) => { await deleteCategory(id); router.refresh(); }}
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{editing ? (t['specialists.edit'] ?? 'Edit Specialist') : (t['specialists.add'] ?? 'Add Specialist')}</h2>
              <button onClick={() => { setModal(false); setEditing(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editing ? updateAction : createAction} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              {state?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">{t['specialists.f_name'] ?? 'Name'} *</label>
                <input name="specialist_name" required defaultValue={editing?.specialist_name ?? ''} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t['specialists.f_type'] ?? 'Specialist type'}</label>
                <select name="specialist_type_id" defaultValue={editing?.specialist_type_id ?? ''} className={inputCls}>
                  <option value="">—</option>
                  {specialistTypes.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t['specialists.f_languages'] ?? 'Languages (comma-separated)'}</label>
                <input name="languages" defaultValue={(editing?.languages ?? []).join(', ')} placeholder="ქართული, English" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="active" value="true" defaultChecked={editing?.active ?? true} className="w-4 h-4 accent-primary" />
                {t['services.f_active'] ?? 'Active'}
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setModal(false); setEditing(null); }} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t['common.cancel'] ?? 'Cancel'}</button>
                <button type="submit" disabled={editing ? updatePending : createPending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {(editing ? updatePending : createPending) ? (t['common.saving'] ?? 'Saving...') : (t['common.save'] ?? 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function NamedListEditor({ rows, placeholder, emptyLabel, onAdd, onDelete }: {
  rows: NamedRow[];
  placeholder: string;
  emptyLabel: string;
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [value, setValue] = useState('');
  const [pending, startTransition] = useTransition();

  const add = () => {
    const name = value.trim();
    if (!name) return;
    setValue('');
    startTransition(() => onAdd(name));
  };

  return (
    <div className="max-w-xl">
      <div className="flex gap-2 mb-4">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button onClick={add} disabled={pending} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm disabled:opacity-50">
          <Plus className="w-4 h-4" />{t['common.add'] ?? 'Add'}
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">{emptyLabel}</div>
        ) : rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
            <span className="text-sm font-medium">{r.name}</span>
            <button onClick={() => startTransition(() => onDelete(r.id))} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
