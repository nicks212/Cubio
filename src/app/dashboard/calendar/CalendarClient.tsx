'use client';

import { useState, useActionState, useMemo, useEffect } from 'react';
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
interface ServiceOpt { id: string; service_name: string; duration_minutes: number | null; specialist_type_id: string | null; }
interface SpecialistOpt { id: string; specialist_name: string; specialist_type_id: string | null; }
interface ScheduleRow { specialist_id: string; weekday: number; start_time: string; end_time: string; }
interface SpecVacation { specialist_id: string; start_date: string; end_date: string; }
interface BizVacation { start_date: string; end_date: string; }
interface BizHours { weekday: number; opening_time: string | null; closing_time: string | null; closed: boolean; }

interface Props {
  reservations: Reservation[];
  services: ServiceOpt[];
  specialists: SpecialistOpt[];
  schedules: ScheduleRow[];
  specialistVacations: SpecVacation[];
  businessVacations: BizVacation[];
  businessHours: BizHours[];
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
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = (d: Date) => { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; };

export default function CalendarClient({ reservations, services, specialists, schedules, specialistVacations, businessVacations, businessHours }: Props) {
  const t = useT();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [prefillSpecialist, setPrefillSpecialist] = useState<string | null>(null);
  // Bumped on each open so the modal remounts with fresh action state (errors cleared).
  const [openSeq, setOpenSeq] = useState(0);

  const closeModal = () => { setModal(false); setEditing(null); setPrefillDate(null); setPrefillTime(null); setPrefillSpecialist(null); };

  const svcName = (id: string | null) => services.find(s => s.id === id)?.service_name ?? '';
  const specName = (id: string | null) => specialists.find(s => s.id === id)?.specialist_name ?? (t['calendar.unassigned'] ?? 'Unassigned');

  const openAdd = (date?: string, time?: string, specialistId?: string | null) => {
    setEditing(null); setPrefillDate(date ?? ymd(anchor)); setPrefillTime(time ?? null); setPrefillSpecialist(specialistId ?? null);
    setOpenSeq(n => n + 1); setModal(true);
  };
  const openEdit = (r: Reservation) => {
    setEditing(r); setPrefillDate(null); setPrefillTime(null); setPrefillSpecialist(null);
    setOpenSeq(n => n + 1); setModal(true);
  };

  const step = (dir: number) => setAnchor(a => addDays(a, dir * (view === 'day' ? 1 : 7)));

  const weekDays = useMemo(() => { const s = weekStart(anchor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }, [anchor]);
  const dayCols = useMemo(() => {
    const cols: Array<{ id: string | null; name: string }> = specialists.map(s => ({ id: s.id, name: s.specialist_name }));
    return cols.length > 0 ? cols : [{ id: null, name: t['calendar.unassigned'] ?? 'Unassigned' }];
  }, [specialists, t]);

  const resOn = (date: string) => reservations.filter(r => r.reservation_date === date);

  // ── Working-window computation for the day view (#4 passive slots) ──
  const anchorDate = ymd(anchor);
  const anchorWeekday = anchor.getDay();
  const bizClosedToday =
    businessVacations.some(v => v.start_date <= anchorDate && v.end_date >= anchorDate) ||
    businessHours.find(h => h.weekday === anchorWeekday)?.closed === true;
  const bizH = businessHours.find(h => h.weekday === anchorWeekday);
  const bizOpen = bizH?.opening_time ? toMin(bizH.opening_time) : null;
  const bizClose = bizH?.closing_time ? toMin(bizH.closing_time) : null;

  const windowsFor = (specId: string | null): Array<{ s: number; e: number }> => {
    if (!specId || bizClosedToday) return [];
    if (specialistVacations.some(v => v.specialist_id === specId && v.start_date <= anchorDate && v.end_date >= anchorDate)) return [];
    return schedules
      .filter(s => s.specialist_id === specId && s.weekday === anchorWeekday)
      .map(s => ({
        s: bizOpen != null ? Math.max(toMin(s.start_time), bizOpen) : toMin(s.start_time),
        e: bizClose != null ? Math.min(toMin(s.end_time), bizClose) : toMin(s.end_time),
      }))
      .filter(w => w.e > w.s);
  };
  const slotActive = (wins: Array<{ s: number; e: number }>, m: number) => wins.some(w => m >= w.s && m < w.e);

  const headerLabel = view === 'day'
    ? anchor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${weekDays[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const slots = Array.from({ length: (DAY_END - DAY_START) / SLOT }, (_, i) => DAY_START + i * SLOT);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
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

      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => step(-1)} className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setAnchor(new Date())} className="px-3 py-2 text-sm font-medium hover:bg-slate-100 rounded-lg border border-slate-200">{t['calendar.today'] ?? 'Today'}</button>
        <button onClick={() => step(1)} className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200"><ChevronRight className="w-4 h-4" /></button>
        <span className="text-base font-semibold">{headerLabel}</span>
      </div>

      {view === 'day' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <div className="flex min-w-fit">
            <div className="flex-shrink-0 w-16 border-r border-slate-200">
              <div className="h-10 border-b border-slate-200" />
              <div className="relative" style={{ height: slots.length * ROW_H }}>
                {slots.map((m, i) => m % 60 === 0 ? (
                  <div key={m} style={{ top: i * ROW_H }} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    {m / 60}:00
                  </div>
                ) : null)}
              </div>
            </div>
            {dayCols.map(col => {
              const colRes = resOn(anchorDate).filter(r => (r.specialist_id ?? null) === col.id);
              const wins = windowsFor(col.id);
              const offToday = wins.length === 0;
              return (
                <div key={col.id ?? 'unassigned'} className="flex-1 min-w-[180px] border-r border-slate-200 last:border-r-0">
                  <div className="h-10 border-b border-slate-200 flex items-center justify-center gap-1 text-sm font-semibold px-2 truncate">
                    {col.name}
                    {offToday && <span className="text-[10px] font-normal text-muted-foreground">({t['calendar.off'] ?? 'off'})</span>}
                  </div>
                  <div className="relative" style={{ height: slots.length * ROW_H }}>
                    {slots.map((m, i) => {
                      const active = slotActive(wins, m);
                      return (
                        <div key={m} style={{ top: i * ROW_H, height: ROW_H }}
                          className={`absolute inset-x-0 border-b border-slate-100 ${active ? 'hover:bg-slate-50 cursor-pointer' : 'bg-slate-100/70 cursor-not-allowed'}`}
                          onClick={active ? () => openAdd(anchorDate, fromMin(m), col.id) : undefined} />
                      );
                    })}
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
          key={openSeq}
          editing={editing}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
          prefillSpecialist={prefillSpecialist}
          services={services}
          specialists={specialists}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function ReservationModal({ editing, prefillDate, prefillTime, prefillSpecialist, services, specialists, onClose }: {
  editing: Reservation | null;
  prefillDate: string | null;
  prefillTime: string | null;
  prefillSpecialist: string | null;
  services: ServiceOpt[];
  specialists: SpecialistOpt[];
  onClose: () => void;
}) {
  const t = useT();
  const isEdit = !!editing;
  // Action state lives here so it resets every time the modal opens (errors cleared, #5).
  const [createState, createAction, createPending] = useActionState(createReservation, null);
  const [updateState, updateAction, updatePending] = useActionState(updateReservation, null);
  const action = isEdit ? updateAction : createAction;
  const pending = isEdit ? updatePending : createPending;
  const state = isEdit ? updateState : createState;
  useEffect(() => { if (state?.success) onClose(); }, [state, onClose]);

  const [showPet, setShowPet] = useState(!!(editing?.animal_type || editing?.pet_name));
  const inputCls = 'w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50';

  // Bidirectional filtering: picking a service narrows specialists (#6); picking a
  // specialist narrows services to ones they perform (#1).
  const [serviceId, setServiceId] = useState<string>(editing?.service_id ?? '');
  const [specialistId, setSpecialistId] = useState<string>(editing?.specialist_id ?? prefillSpecialist ?? '');
  const selectedService = services.find(s => s.id === serviceId);
  const selectedSpecialist = specialists.find(s => s.id === specialistId);
  const eligibleSpecialists = selectedService?.specialist_type_id
    ? specialists.filter(s => s.specialist_type_id === selectedService.specialist_type_id)
    : specialists;
  const eligibleServices = selectedSpecialist?.specialist_type_id
    ? services.filter(s => s.specialist_type_id === selectedSpecialist.specialist_type_id)
    : services;

  useEffect(() => {
    if (specialistId && !eligibleSpecialists.some(s => s.id === specialistId)) setSpecialistId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);
  useEffect(() => {
    if (serviceId && !eligibleServices.some(s => s.id === serviceId)) setServiceId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialistId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold">{editing ? (t['calendar.edit'] ?? 'Edit reservation') : (t['calendar.add'] ?? 'New reservation')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form action={action} className="p-6 space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {state?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>}

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
              <label className="block text-sm font-medium mb-2">{t['calendar.f_service'] ?? 'Service'} *</label>
              <select name="service_id" required value={serviceId} onChange={e => setServiceId(e.target.value)} className={inputCls}>
                <option value="">{t['calendar.select_service'] ?? 'Select service…'}</option>
                {eligibleServices.map(s => <option key={s.id} value={s.id}>{s.service_name}{s.duration_minutes ? ` (${s.duration_minutes}m)` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_specialist'] ?? 'Specialist'} *</label>
              <select name="specialist_id" required value={specialistId} onChange={e => setSpecialistId(e.target.value)} className={inputCls}>
                <option value="">{t['calendar.select_specialist'] ?? 'Select specialist…'}</option>
                {eligibleSpecialists.map(s => <option key={s.id} value={s.id}>{s.specialist_name}</option>)}
              </select>
              {selectedService?.specialist_type_id && eligibleSpecialists.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">{t['calendar.no_eligible'] ?? 'No specialist of the required type is available.'}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_date'] ?? 'Date'} *</label>
              <input type="date" name="reservation_date" required defaultValue={editing?.reservation_date ?? prefillDate ?? ''} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t['calendar.f_start'] ?? 'Start time'} *</label>
              <input type="time" name="reservation_start_time" required defaultValue={editing?.reservation_start_time?.slice(0, 5) ?? prefillTime ?? '10:00'} className={inputCls} />
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
