import { createAdminClient } from '@/lib/supabase/server';

/**
 * Deterministic Availability Engine (spec §12) — the SINGLE source of truth for
 * open reservation slots. Gemini must never compute availability; it only ever
 * offers slots returned here. This function considers, all in the backend:
 *   - service duration
 *   - business closures (business_vacations) and business_hours for the weekday
 *   - each specialist's weekly working hours (specialist_schedules)
 *   - specialist vacations / days off (specialist_vacations)
 *   - existing blocking reservations (no overlap / no double-booking)
 *
 * Pure data + arithmetic; no AI calls.
 */

export interface AvailableSlot {
  specialistId: string;
  specialistName: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Reservation statuses that still occupy the slot.
const BLOCKING_STATUSES = [
  'pending', 'awaiting_customer_confirmation', 'confirmed', 'rescheduled', 'checked_in', 'in_progress', 'completed',
];

export interface GenerateSlotsParams {
  companyId: string;
  /** YYYY-MM-DD */
  date: string;
  durationMin: number;
  /** Restrict to specialists of this type (from the chosen service). */
  specialistTypeId?: string | null;
  /** Restrict to a single specialist. */
  specialistId?: string | null;
  maxSlots?: number;
  /** Granularity for slot starts; defaults to the service duration. */
  stepMin?: number;
}

export async function generateAvailableSlots(params: GenerateSlotsParams): Promise<AvailableSlot[]> {
  const { companyId, date, durationMin } = params;
  if (!companyId || !date || !durationMin || durationMin <= 0) return [];
  const supabase = createAdminClient();

  const weekday = new Date(`${date}T00:00:00`).getDay(); // 0=Sun..6=Sat
  const step = params.stepMin ?? durationMin;
  const maxSlots = params.maxSlots ?? 12;

  // 1. Business-wide closure.
  const { data: bizVac } = await supabase
    .from('business_vacations').select('id').eq('company_id', companyId)
    .lte('start_date', date).gte('end_date', date).limit(1);
  if (bizVac && bizVac.length > 0) return [];

  // 2. Optional business-hours clamp for the weekday.
  let bizOpen: number | null = null, bizClose: number | null = null;
  const { data: bizHours } = await supabase
    .from('business_hours').select('opening_time, closing_time, closed').eq('company_id', companyId).eq('weekday', weekday);
  if (bizHours && bizHours.length > 0) {
    if (bizHours[0].closed) return [];
    if (bizHours[0].opening_time) bizOpen = toMin(bizHours[0].opening_time);
    if (bizHours[0].closing_time) bizClose = toMin(bizHours[0].closing_time);
  }

  // 3. Eligible specialists (active; matching the service's required type if any).
  let specQuery = supabase.from('specialists').select('id, specialist_name, specialist_type_id')
    .eq('company_id', companyId).eq('active', true).is('deleted_at', null);
  if (params.specialistId) specQuery = specQuery.eq('id', params.specialistId);
  else if (params.specialistTypeId) specQuery = specQuery.eq('specialist_type_id', params.specialistTypeId);
  const { data: specialists } = await specQuery;
  if (!specialists || specialists.length === 0) return [];
  const specIds = specialists.map(s => s.id);

  // 4. Bulk-load schedules, vacations, existing reservations for these specialists.
  const [{ data: schedules }, { data: vacations }, { data: reservations }] = await Promise.all([
    supabase.from('specialist_schedules').select('specialist_id, weekday, start_time, end_time').eq('company_id', companyId).in('specialist_id', specIds).eq('weekday', weekday),
    supabase.from('specialist_vacations').select('specialist_id').eq('company_id', companyId).in('specialist_id', specIds).lte('start_date', date).gte('end_date', date),
    supabase.from('reservations').select('specialist_id, reservation_start_time, reservation_end_time, status').eq('company_id', companyId).eq('reservation_date', date).in('specialist_id', specIds),
  ]);

  const onVacation = new Set((vacations ?? []).map(v => v.specialist_id));
  const schedBySpec = new Map<string, Array<{ s: number; e: number }>>();
  for (const row of schedules ?? []) {
    const arr = schedBySpec.get(row.specialist_id) ?? [];
    arr.push({ s: toMin(row.start_time), e: toMin(row.end_time) });
    schedBySpec.set(row.specialist_id, arr);
  }
  const busyBySpec = new Map<string, Array<{ s: number; e: number }>>();
  for (const r of reservations ?? []) {
    if (!BLOCKING_STATUSES.includes(r.status)) continue;
    const arr = busyBySpec.get(r.specialist_id) ?? [];
    arr.push({ s: toMin(r.reservation_start_time), e: toMin(r.reservation_end_time) });
    busyBySpec.set(r.specialist_id, arr);
  }

  // 5. Generate candidate slots per specialist.
  const slots: AvailableSlot[] = [];
  for (const sp of specialists) {
    if (onVacation.has(sp.id)) continue;
    const windows = schedBySpec.get(sp.id);
    if (!windows || windows.length === 0) continue; // no working hours that weekday
    const busy = busyBySpec.get(sp.id) ?? [];
    for (const w of windows) {
      const winStart = bizOpen != null ? Math.max(w.s, bizOpen) : w.s;
      const winEnd = bizClose != null ? Math.min(w.e, bizClose) : w.e;
      for (let s = winStart; s + durationMin <= winEnd; s += step) {
        const e = s + durationMin;
        const overlaps = busy.some(b => b.s < e && b.e > s);
        if (!overlaps) slots.push({ specialistId: sp.id, specialistName: sp.specialist_name, start: fromMin(s), end: fromMin(e) });
      }
    }
  }

  // Sort by time, then specialist; cap for compact prompt injection.
  slots.sort((a, b) => a.start.localeCompare(b.start) || a.specialistName.localeCompare(b.specialistName));
  return slots.slice(0, maxSlots);
}
