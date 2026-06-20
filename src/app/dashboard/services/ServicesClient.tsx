'use client';

import { useState, useActionState } from 'react';
import { Plus, Edit, Trash2, X, Scissors, PawPrint } from 'lucide-react';
import { createService, updateService, deleteService } from './actions';
import { useT } from '@/components/TranslationsProvider';

interface Service {
  id: string;
  service_name: string;
  description: string | null;
  category_id: string | null;
  specialist_type_id: string | null;
  gender_target: string;
  price_from: number | null;
  price_to: number | null;
  currency: string;
  duration_minutes: number | null;
  sessions_required: number;
  preparation_instructions: string | null;
  consultation_required: boolean;
  active: boolean;
  service_target: string;
  animal_type: string | null;
  breed: string | null;
  size_category: string | null;
  special_requirements: string | null;
}
interface NamedRow { id: string; name: string; }

interface Props {
  services: Service[];
  categories: NamedRow[];
  specialistTypes: NamedRow[];
}

export default function ServicesClient({ services, categories, specialistTypes }: Props) {
  const t = useT();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [petMode, setPetMode] = useState('human');

  const [createState, createAction, createPending] = useActionState(createService, null);
  const [updateState, updateAction, updatePending] = useActionState(updateService, null);
  const state = editing ? updateState : createState;
  if (state?.success && modal) { setModal(false); setEditing(null); }

  const openAdd = () => { setEditing(null); setPetMode('human'); setModal(true); };
  const openEdit = (s: Service) => { setEditing(s); setPetMode(s.service_target ?? 'human'); setModal(true); };

  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? '—';
  const typeName = (id: string | null) => specialistTypes.find(c => c.id === id)?.name ?? '—';
  const priceLabel = (s: Service) => {
    const sym = s.currency === 'USD' ? '$' : '₾';
    if (s.price_from != null && s.price_to != null && s.price_to !== s.price_from) return `${sym}${s.price_from}–${sym}${s.price_to}`;
    if (s.price_from != null) return `${sym}${s.price_from}`;
    return '—';
  };

  const inputCls = 'w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
            <Scissors className="w-7 h-7 text-primary" />{t['services.title'] ?? 'Services'}
          </h1>
          <p className="text-muted-foreground">{t['services.subtitle'] ?? 'Manage the services your business offers.'}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
          <Plus className="w-4 h-4" />{t['services.add'] ?? 'Add Service'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {[t['services.col_name'] ?? 'Service', t['services.col_category'] ?? 'Category', t['services.col_price'] ?? 'Price', t['services.col_duration'] ?? 'Duration', t['services.col_specialist'] ?? 'Specialist', t['services.col_status'] ?? 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">{t['services.empty'] ?? 'No services yet. Add your first one.'}</td></tr>
              ) : services.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      {s.service_name}
                      {s.service_target !== 'human' && <PawPrint className="w-3.5 h-3.5 text-pink-500" />}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{catName(s.category_id)}</td>
                  <td className="py-3 px-4 text-sm">{priceLabel(s)}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{s.duration_minutes ? `${s.duration_minutes} min` : '—'}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{typeName(s.specialist_type_id)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.active ? (t['services.active'] ?? 'Active') : (t['services.inactive'] ?? 'Inactive')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm(t['services.delete_confirm'] ?? 'Delete this service?')) deleteService(s.id); }} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{editing ? (t['services.edit'] ?? 'Edit Service') : (t['services.add'] ?? 'Add Service')}</h2>
              <button onClick={() => { setModal(false); setEditing(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editing ? updateAction : createAction} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              {state?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>}

              <div>
                <label className="block text-sm font-medium mb-2">{t['services.f_name'] ?? 'Service name'} *</label>
                <input name="service_name" required defaultValue={editing?.service_name ?? ''} className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t['services.f_description'] ?? 'Description'}</label>
                <textarea name="description" rows={2} defaultValue={editing?.description ?? ''} className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_category'] ?? 'Category'}</label>
                  <select name="category_id" defaultValue={editing?.category_id ?? ''} className={inputCls}>
                    <option value="">—</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_specialist_type'] ?? 'Specialist type'}</label>
                  <select name="specialist_type_id" defaultValue={editing?.specialist_type_id ?? ''} className={inputCls}>
                    <option value="">—</option>
                    {specialistTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_price_from'] ?? 'Price from'}</label>
                  <input name="price_from" type="number" step="0.01" defaultValue={editing?.price_from ?? ''} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_price_to'] ?? 'Price to'}</label>
                  <input name="price_to" type="number" step="0.01" defaultValue={editing?.price_to ?? ''} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_currency'] ?? 'Currency'}</label>
                  <select name="currency" defaultValue={editing?.currency ?? 'GEL'} className={inputCls}>
                    <option value="GEL">GEL ₾</option>
                    <option value="USD">USD $</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_duration'] ?? 'Duration (min)'}</label>
                  <input name="duration_minutes" type="number" defaultValue={editing?.duration_minutes ?? ''} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_sessions'] ?? 'Sessions'}</label>
                  <input name="sessions_required" type="number" min="1" defaultValue={editing?.sessions_required ?? 1} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t['services.f_gender'] ?? 'For'}</label>
                  <select name="gender_target" defaultValue={editing?.gender_target ?? 'unisex'} className={inputCls}>
                    <option value="unisex">{t['services.unisex'] ?? 'Unisex'}</option>
                    <option value="female">{t['services.female'] ?? 'Female'}</option>
                    <option value="male">{t['services.male'] ?? 'Male'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t['services.f_prep'] ?? 'Preparation instructions'}</label>
                <textarea name="preparation_instructions" rows={2} defaultValue={editing?.preparation_instructions ?? ''} className={`${inputCls} resize-none`} />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="consultation_required" value="true" defaultChecked={editing?.consultation_required ?? false} className="w-4 h-4 accent-primary" />
                  {t['services.f_consultation'] ?? 'Consultation required'}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="active" value="true" defaultChecked={editing?.active ?? true} className="w-4 h-4 accent-primary" />
                  {t['services.f_active'] ?? 'Active'}
                </label>
              </div>

              {/* Pet targeting — optional, same engine (spec §22) */}
              <div className="border-t border-slate-200 pt-4">
                <label className="block text-sm font-medium mb-2">{t['services.f_target'] ?? 'Service target'}</label>
                <select name="service_target" value={petMode} onChange={e => setPetMode(e.target.value)} className={inputCls}>
                  <option value="human">{t['services.target_human'] ?? 'People'}</option>
                  <option value="pet">{t['services.target_pet'] ?? 'Pets'}</option>
                  <option value="both">{t['services.target_both'] ?? 'People & pets'}</option>
                </select>
                {petMode !== 'human' && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <input name="animal_type" placeholder={t['services.f_animal'] ?? 'Animal type'} defaultValue={editing?.animal_type ?? ''} className={inputCls} />
                    <input name="breed" placeholder={t['services.f_breed'] ?? 'Breed'} defaultValue={editing?.breed ?? ''} className={inputCls} />
                    <input name="size_category" placeholder={t['services.f_size'] ?? 'Size category'} defaultValue={editing?.size_category ?? ''} className={inputCls} />
                    <input name="special_requirements" placeholder={t['services.f_special'] ?? 'Special requirements'} defaultValue={editing?.special_requirements ?? ''} className={inputCls} />
                  </div>
                )}
              </div>

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
