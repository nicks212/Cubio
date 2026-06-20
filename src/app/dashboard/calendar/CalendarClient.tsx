'use client';

import { useState, useActionState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, Trash2 } from 'lucide-react';
import { createReservation, updateReservation, deleteReservation } from './actions';
import { useT } from '@/components/TranslationsProvider';

interface Reservation {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  service_id: string | null;
  specialist_id: string | null;
  reservation_date: string;
  reservation_start_time: string;
  reservation_end_time: string;
  status: string;
  source: string;
  notes: string | null;
  pet_name: string | null;
  animal_type: string | null;
  breed: string | null;
  size_category: string | null;
  special_requirements: string | null;
}
interface ServiceOpt { id: string; service_name: string; duration_minutes: number | null; }
interface SpecialistOpt { id: string; specialist_name: string; }

interface Props {
  reservations: Reservation[];
  services: ServiceOpt[];
  specialists: SpecialistOpt[];
}

const STATUSES = [
  'pending', 'awaiting_customer_confirmation', 'confirmed', 'rescheduled',
  'checked_in', 'in_progress', 'completed',
  'cancelled_by_customer', 'cancelled_by_business', 'no_show',
];
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  awaiting_customer_confirmation: { label: 'Awaiting customer', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  checked_in: { label: 'Checked in', cls: 'bg-teal-100 text-teal-800 border-teal-300' },
  in_progress: { label: 'In progress', cls: 'bg-green-100 text-green-800 border-green-300' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  cancelled_by_customer: { label: 'Cancelled (customer)', cls: 'bg-red-50 text-red-600 border-red-200' },
  cancelled_by_business: { label: 'Cancelled (business)', cls: 'bg-red-50 text-red-600 border-red-200' },
  no_show: { label: 'No-show', cls: 'bg-red-50 text-red-600 border-red-200' },
};

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const SLOT = 30;
const ROW_H = 44;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = (d: Date) => { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; };

export default function CalendarClient({ reservations, services, specialists }: Props) {
  const t = useT();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);

  const [createState, createAction, createPending] = useActionState(createReservation, null);
  const [updateState, updateAction, updatePending] = useActionState(updateReservation, null);
  const state = editing ? updateState : createState;
  if (state?.success && modal) { setModal(false); setEditing(null); setPrefillDate(null); }

  const svcName = (id: string | null) => services.find(s => s.id === id)?.service_name ?? '';
  const specName = (id: string | null) => specialists.find(s => s.id === id)?.specialist_name ?? (t['calendar.unassigned'] ?? 'Unassigned');

  const openAdd = (date?: string) => { setEditing(null); setPrefillDate(date ?? ymd(anchor)); setModal(true); };
  const openEdit = (r: Reservation) => { setEditing(r); setPrefillDate(null); setModal(true); };

  const step = (dir: number) => setAnchor(a => addDays(a, dir * (view === 'day' ? 1 : 7)));

  const weekDays = useMemo(() => { const s = weekStart(anchor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }, [anchor]);
  const dayCols = useMemo(() => {
    // specialist columns + a trailing "unassigned" bucket if any unassigned reservations exist that day
    const cols: Array<{ id: string | null; name: string }> = specialists.map(s => ({ id: s.id, name: s.specialist_name }));
    return cols.length > 0 ? cols : [{ id: null, name: t['calendar.unassigned'] ?? 'Unassigned' }];
  }, [specialists, t]);

  const resOn = (date: string) => reservations.filter(r => r.reservation_date === date);
  const headerLabel = view === 'day'
    ? anchor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${weekDays[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const slots = Array.from({ length: (DAY_END - DAY_START) / SLOT }, (_, i) => DAY_START + i * SLOT);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="w-7 h-7 text-primary" />{t['calendar.title'] ?? 'Calendar'}
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setView('day')} className={`px-4 py-1.5 rounded-md text-sm font-medium ${view === 'day' ? 'bg-white shadow-sm' : 'text-muted-foreground'}`}>{t['calendar.day'] ?? 'Day'}</button>
            <button onClick={() => setView('week')} className={`px-4 py-1.5 rounded-md text-sm font-medium ${view === 'week' ? 'bg-white shadow-sm' : 'text-muted-foreground'}`}>{t['calendar.week'] ?? 'Week'}</button>
          </div>
          <button onClick={() => openAdd()} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium text-sm">
            <Plus className="w-4 h-4" />{t['calendar.add'] ?? 'New reservation'}
          </button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => step(-1)} className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setAnchor(new Date())} className="px-3 py-2 text-sm font-medium hover:bg-slate-100 rounded-lg border border-slate-200">{t['calendar.today'] ?? 'Today'}</button>
        <button onClick={() => step(1)} className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200"><ChevronRight className="w-4 h-4" /></button>
        <span className="text-base font-semibold">{headerLabel}</span>
      </div>

      {view === 'day' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <div className="flex min-w-fit">
            {/* Time axis */}
            <div className="flex-shrink-0 w-16 border-r border-slate-200">
              <div className="h-10 border-b border-slate-200" />
              {slots.map(m => (
                <div key={m} style={{ height: ROW_H }} className="text-[11px] text-muted-foreground text-right pr-2 -mt-2">
                  {m % 60 === 0 ? `${m / 60}:00` : ''}
                </div>
              ))}
            </div>
            {/* Specialist columns */}
            {dayCols.map(col => {
              const colRes = resOn(ymd(anchor)).filter(r => (r.specialist_id ?? null) === col.id);
              return (
                <div key={col.id ?? 'unassigned'} className="flex-1 min-w-[180px] border-r border-slate-200 last:border-r-0">
                  <div className="h-10 border-b border-slate-200 flex items-center justify-center text-sm font-semibold px-2 truncate">{col.name}</div>
                  <div className="relative" style={{ height: slots.length * ROW_H }}>
                    {slots.map((m, i) => (
                      <div key={m} style={{ top: i * ROW_H, height: ROW_H }}
                        className="absolute inset-x-0 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => openAdd(ymd(anchor))} />
                    ))}
                    {colRes.map(r => {
                      const top = ((toMin(r.reservation_start_time) - DAY_START) / SLOT) * ROW_H;
                      const h = Math.max(((toMin(r.reservation_end_time) - toMin(r.reservation_start_time)) / SLOT) * ROW_H, 22);
                      const meta = STATUS_META[r.status] ?? STATUS_META.confirmed;
                      return (
                        <button key={r.id} onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                          style={{ top: Math.max(top, 0), height: h }}
                          className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-left overflow-hidden ${meta.cls}`}>
                          <p className="text-[11px] font-semibold truncate">{r.reservation_start_time.slice(0, 5)} {r.customer_name ?? '—'}</p>
                          <p className="text-[10px] truncate opacity-80">{svcName(r.service_id)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map(d => {
            const dateStr = ymd(d);
            const isToday = dateStr === ymd(new Date());
            const list = resOn(dateStr).sort((a, b) => a.reservation_start_time.localeCompare(b.reservation_start_time));
            return (
              <div key={dateStr} className={`bg-white rounded-xl border ${isToday ? 'border-primary' : 'border-slate-200'} overflow-hidden`}>
                <div className={`px-3 py-2 border-b border-slate-200 flex items-center justify-between ${isToday ? 'bg-primary/5' : ''}`}>
                  <span className="text-sm font-semibold">{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
                  <button onClick={() => openAdd(dateStr)} className="p-1 hover:bg-slate-100 rounded text-muted-foreground"><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">—</p>
                  ) : list.map(r => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.confirmed;
                    return (
                      <button key={r.id} onClick={() => openEdit(r)} className={`w-full text-left rounded-lg border px-2 py-1.5 ${meta.cls}`}>
                        <p className="text-[11px] font-semibold truncate">{r.reservation_start_time.slice(0, 5)} · {r.customer_name ?? '—'}</p>
                        <p className="text-[10px] truncate opacity-80">{svcName(r.service_id)} · {specName(r.specialist_id)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ReservationModal
          editing={editing}
          prefillDate={prefillDate}
          services={services}
          specialists={specialists}
          action={editing ? updateAction : createAction}
          pending={editing ? updatePending : createPending}
          error={state?.error ?? null}
          onClose={() => { setModal(false); setEditing(null); setPrefillDate(null); }}
        />
      )}
    </div>
  );
}

function ReservationModal({ editing, prefillDate, services, specialists, action, pending, error, onClose }: {
  editing: Reservation | null;
  prefillDate: string | null;
  services: ServiceOpt[];
  specialists: SpecialistOpt[];
  action: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const [showPet, setShowPet] = useState(!!(editing?.animal_type || editing?.pet_name));
  const inputCls = 'w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold">{editing ? (t['calendar.edit'] ?? 'Edit reservation') : (t['calendar.add'] ?? 'New reservation')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form action={action} className="p-6 space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_customer'] ?? 'Customer name'}</label>
              <input name="customer_name" defaultValue={editing?.customer_name ?? ''} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_phone'] ?? 'Phone'}</label>
              <input name="customer_phone" defaultValue={editing?.customer_phone ?? ''} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_service'] ?? 'Service'}</label>
              <select name="service_id" defaultValue={editing?.service_id ?? ''} className={inputCls}>
                <option value="">—</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.service_name}{s.duration_minutes ? ` (${s.duration_minutes}m)` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_specialist'] ?? 'Specialist'}</label>
              <select name="specialist_id" defaultValue={editing?.specialist_id ?? ''} className={inputCls}>
                <option value="">{t['calendar.unassigned'] ?? 'Unassigned'}</option>
                {specialists.map(s => <option key={s.id} value={s.id}>{s.specialist_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_date'] ?? 'Date'} *</label>
              <input type="date" name="reservation_date" required defaultValue={editing?.reservation_date ?? prefillDate ?? ''} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_start'] ?? 'Start time'} *</label>
              <input type="time" name="reservation_start_time" required defaultValue={editing?.reservation_start_time?.slice(0, 5) ?? '10:00'} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">{t['calendar.end_auto'] ?? 'End time is set automatically from the service duration.'}</p>

          <div>
            <label className="block text-sm font-medium mb-2">{t['calendar.f_status'] ?? 'Status'}</label>
            <select name="status" defaultValue={editing?.status ?? 'confirmed'} className={inputCls}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t['calendar.f_notes'] ?? 'Notes'}</label>
            <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ''} className={`${inputCls} resize-none`} />
          </div>

          <div className="border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setShowPet(v => !v)} className="text-sm font-medium text-primary">
              {showPet ? '− ' : '+ '}{t['calendar.pet_details'] ?? 'Pet details (optional)'}
            </button>
            {showPet && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <input name="pet_name" placeholder={t['calendar.f_pet_name'] ?? 'Pet name'} defaultValue={editing?.pet_name ?? ''} className={inputCls} />
                <input name="animal_type" placeholder={t['services.f_animal'] ?? 'Animal type'} defaultValue={editing?.animal_type ?? ''} className={inputCls} />
                <input name="breed" placeholder={t['services.f_breed'] ?? 'Breed'} defaultValue={editing?.breed ?? ''} className={inputCls} />
                <input name="size_category" placeholder={t['services.f_size'] ?? 'Size'} defaultValue={editing?.size_category ?? ''} className={inputCls} />
                <input name="special_requirements" placeholder={t['services.f_special'] ?? 'Special requirements'} defaultValue={editing?.special_requirements ?? ''} className={`${inputCls} col-span-2`} />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            {editing && (
              <button type="button" onClick={() => { if (confirm(t['calendar.delete_confirm'] ?? 'Delete this reservation?')) { deleteReservation(editing.id); onClose(); } }}
                className="px-4 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"><Trash2 className="w-4 h-4" /></button>
            )}
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t['common.cancel'] ?? 'Cancel'}</button>
            <button type="submit" disabled={pending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
              {pending ? (t['common.saving'] ?? 'Saving...') : (t['common.save'] ?? 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
