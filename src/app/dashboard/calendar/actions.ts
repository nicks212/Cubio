'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const RESERVATION_STATUSES = [
  'pending', 'awaiting_customer_confirmation', 'confirmed', 'rescheduled',
  'checked_in', 'in_progress', 'completed',
  'cancelled_by_customer', 'cancelled_by_business', 'no_show',
] as const;

// Statuses that still occupy the slot (used for conflict detection).
const BLOCKING_STATUSES = [
  'pending', 'awaiting_customer_confirmation', 'confirmed', 'rescheduled', 'checked_in', 'in_progress', 'completed',
];

const reservationSchema = z.object({
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  service_id: z.string().uuid().optional().nullable(),
  specialist_id: z.string().uuid().optional().nullable(),
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservation_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  reservation_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  status: z.enum(RESERVATION_STATUSES).default('confirmed'),
  notes: z.string().optional(),
  pet_name: z.string().optional(),
  animal_type: z.string().optional(),
  breed: z.string().optional(),
  size_category: z.string().optional(),
  special_requirements: z.string().optional(),
});

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const toTime = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

async function getCompanyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('company_id').eq('id', userId).single();
  return data?.company_id ?? null;
}

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const };
  const company_id = await getCompanyId(supabase, user.id);
  if (!company_id) return { error: 'No company' as const };
  return { supabase, company_id };
}

/**
 * Validates a booking and computes its end time deterministically (start + service
 * duration). Reservations REQUIRE a service with a real duration and a specialist
 * who performs that service — there is NO default duration. Returns {end} or {error}.
 */
async function resolveBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  d: { service_id?: string | null; specialist_id?: string | null; reservation_start_time: string },
): Promise<{ end: string } | { error: string }> {
  if (!d.service_id) return { error: 'Please select a service.' };
  if (!d.specialist_id) return { error: 'Please select a specialist.' };

  const { data: svc } = await supabase
    .from('services').select('duration_minutes, specialist_type_id')
    .eq('id', d.service_id).eq('company_id', companyId).single();
  if (!svc) return { error: 'Service not found.' };
  if (!svc.duration_minutes || svc.duration_minutes <= 0) {
    return { error: 'This service has no duration set — set it on the Services tab before booking.' };
  }

  const { data: spec } = await supabase
    .from('specialists').select('specialist_type_id')
    .eq('id', d.specialist_id).eq('company_id', companyId).single();
  if (!spec) return { error: 'Specialist not found.' };
  if (svc.specialist_type_id && spec.specialist_type_id !== svc.specialist_type_id) {
    return { error: 'This specialist does not perform the selected service.' };
  }

  return { end: toTime(toMin(d.reservation_start_time) + svc.duration_minutes) };
}

/**
 * Backend availability validation (spec §4/§12/§13): rejects a reservation that
 * falls outside the specialist's working hours for that weekday, or on a specialist
 * vacation day, or on a business-wide closure. Returns an error string or null.
 *
 * Rules:
 *  - Business vacation overlapping the date → always reject.
 *  - If business_hours has a row for that weekday and it's closed → reject.
 *  - Specialist vacation overlapping the date → reject.
 *  - If the specialist has ANY weekly schedule configured, the [start,end) must fit
 *    inside one of that weekday's windows; no window for the weekday → reject.
 *    (If the specialist has no schedule at all, treat as unconfigured = allowed.)
 */
async function availabilityError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  specialistId: string | null,
  date: string,
  startTime: string,
  endTime: string,
): Promise<string | null> {
  const weekday = new Date(`${date}T00:00:00`).getDay(); // 0=Sun..6=Sat
  const s = toMin(startTime), e = toMin(endTime);

  // Business-wide closures.
  const { data: bizVac } = await supabase
    .from('business_vacations').select('id').eq('company_id', companyId)
    .lte('start_date', date).gte('end_date', date).limit(1);
  if (bizVac && bizVac.length > 0) return 'The business is closed (vacation/holiday) on that date.';

  const { data: bizHours } = await supabase
    .from('business_hours').select('opening_time, closing_time, closed').eq('company_id', companyId).eq('weekday', weekday);
  if (bizHours && bizHours.length > 0) {
    const row = bizHours[0];
    if (row.closed) return 'The business is closed on that day.';
    if (row.opening_time && row.closing_time && (s < toMin(row.opening_time) || e > toMin(row.closing_time))) {
      return `Outside business hours (${row.opening_time.slice(0, 5)}–${row.closing_time.slice(0, 5)}).`;
    }
  }

  if (!specialistId) return null;

  // Specialist vacation.
  const { data: specVac } = await supabase
    .from('specialist_vacations').select('id').eq('company_id', companyId).eq('specialist_id', specialistId)
    .lte('start_date', date).gte('end_date', date).limit(1);
  if (specVac && specVac.length > 0) return 'The specialist is on vacation on that date.';

  // Specialist weekly schedule — STRICT: a working window for that weekday is required.
  // No schedule for the day (or no schedule at all) means no bookings until hours are set.
  const { data: windows } = await supabase
    .from('specialist_schedules').select('start_time, end_time')
    .eq('company_id', companyId).eq('specialist_id', specialistId).eq('weekday', weekday);
  if (!windows || windows.length === 0) return 'The specialist does not work on that day. Set their weekly hours on the Specialists tab.';
  const fits = windows.some(w => s >= toMin(w.start_time) && e <= toMin(w.end_time));
  if (!fits) {
    const hrs = windows.map(w => `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`).join(', ');
    return `Outside the specialist's working hours (${hrs}).`;
  }
  return null;
}

/**
 * Backend conflict check (spec §13/§14): rejects a reservation that overlaps an
 * existing blocking reservation for the same specialist on the same date.
 * `excludeId` skips the row being edited.
 */
async function hasConflict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  specialistId: string | null,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): Promise<boolean> {
  if (!specialistId) return false; // no specialist assigned → no per-specialist conflict
  const { data } = await supabase
    .from('reservations')
    .select('id, reservation_start_time, reservation_end_time, status')
    .eq('company_id', companyId)
    .eq('specialist_id', specialistId)
    .eq('reservation_date', date);
  const s = toMin(startTime), e = toMin(endTime);
  return (data ?? []).some(r => {
    if (excludeId && r.id === excludeId) return false;
    if (!BLOCKING_STATUSES.includes(r.status)) return false;
    const rs = toMin(r.reservation_start_time), re = toMin(r.reservation_end_time);
    return rs < e && re > s; // overlap
  });
}

export async function createReservation(_prev: unknown, formData: FormData) {
  const a = await authed();
  if ('error' in a) return { error: a.error };

  const obj = Object.fromEntries(formData) as Record<string, unknown>;
  for (const k of ['service_id', 'specialist_id', 'reservation_end_time']) if (obj[k] === '') obj[k] = null;
  const parsed = reservationSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const booking = await resolveBooking(a.supabase, a.company_id, d);
  if ('error' in booking) return { error: booking.error };
  const end = booking.end;
  const availErr = await availabilityError(a.supabase, a.company_id, d.specialist_id ?? null, d.reservation_date, d.reservation_start_time, end);
  if (availErr) return { error: availErr };
  if (await hasConflict(a.supabase, a.company_id, d.specialist_id ?? null, d.reservation_date, d.reservation_start_time, end)) {
    return { error: 'This specialist already has a reservation overlapping that time.' };
  }

  const { error } = await a.supabase.from('reservations').insert({
    ...d,
    reservation_end_time: end,
    source: 'manual',
    company_id: a.company_id,
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/calendar');
  return { success: true };
}

export async function updateReservation(_prev: unknown, formData: FormData) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const id = formData.get('id') as string;

  const obj = Object.fromEntries(formData) as Record<string, unknown>;
  for (const k of ['service_id', 'specialist_id', 'reservation_end_time']) if (obj[k] === '') obj[k] = null;
  const parsed = reservationSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const booking = await resolveBooking(a.supabase, a.company_id, d);
  if ('error' in booking) return { error: booking.error };
  const end = booking.end;
  const availErr = await availabilityError(a.supabase, a.company_id, d.specialist_id ?? null, d.reservation_date, d.reservation_start_time, end);
  if (availErr) return { error: availErr };
  if (await hasConflict(a.supabase, a.company_id, d.specialist_id ?? null, d.reservation_date, d.reservation_start_time, end, id)) {
    return { error: 'This specialist already has a reservation overlapping that time.' };
  }

  const { error } = await a.supabase.from('reservations').update({ ...d, reservation_end_time: end })
    .eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/calendar');
  return { success: true };
}

/** Quick status transition (e.g. confirm, check-in, complete, cancel, no-show). */
export async function setReservationStatus(id: string, status: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  if (!RESERVATION_STATUSES.includes(status as typeof RESERVATION_STATUSES[number])) return { error: 'Invalid status' };
  const { error } = await a.supabase.from('reservations').update({ status }).eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/calendar');
  return { success: true };
}

export async function deleteReservation(id: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const { error } = await a.supabase.from('reservations').delete().eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/calendar');
  return { success: true };
}
