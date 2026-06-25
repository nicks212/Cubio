'use client';

import { useState, useEffect } from 'react';
import { Loader2, User, Phone, Clock, CalendarDays, Scissors, PawPrint } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useT } from '@/components/TranslationsProvider';
import AdminCompanyBrowser, { type BrowserCompany } from './AdminCompanyBrowser';
import { adminListReservations } from './actions';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  awaiting_customer_confirmation: { label: 'Awaiting customer', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-800' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-indigo-100 text-indigo-800' },
  checked_in: { label: 'Checked in', cls: 'bg-teal-100 text-teal-800' },
  in_progress: { label: 'In progress', cls: 'bg-green-100 text-green-800' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600' },
  cancelled_by_customer: { label: 'Cancelled (customer)', cls: 'bg-red-50 text-red-600' },
  cancelled_by_business: { label: 'Cancelled (business)', cls: 'bg-red-50 text-red-600' },
  no_show: { label: 'No-show', cls: 'bg-red-50 text-red-600' },
};

interface JoinedName { service_name?: string | null; specialist_name?: string | null }
interface AdminReservation {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  reservation_date: string;
  reservation_start_time: string;
  reservation_end_time: string | null;
  status: string;
  notes: string | null;
  pet_name: string | null;
  animal_type: string | null;
  breed: string | null;
  service?: JoinedName | JoinedName[] | null;
  specialist?: JoinedName | JoinedName[] | null;
  created_at?: string;
}

const pick = (j: JoinedName | JoinedName[] | null | undefined, key: 'service_name' | 'specialist_name'): string | null => {
  if (!j) return null;
  const obj = Array.isArray(j) ? j[0] : j;
  return obj?.[key] ?? null;
};

function ReservationsPanel({ companyId }: { companyId: string }) {
  const t = useT();
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminListReservations(companyId).then(res => {
      if (!active) return;
      setReservations((res.reservations ?? []) as AdminReservation[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [companyId]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  if (reservations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <CalendarDays className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{t['admin.res_empty'] ?? 'No reservations yet'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reservations.map(r => {
        const meta = STATUS_META[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-600' };
        const serviceName = pick(r.service, 'service_name');
        const specialistName = pick(r.specialist, 'specialist_name');
        const pet = r.pet_name || r.animal_type || r.breed;
        return (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-pink-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <p className="font-medium text-sm">{r.customer_name ?? 'Unknown'}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}>{meta.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{r.reservation_date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.reservation_start_time?.slice(0, 5)}{r.reservation_end_time ? `–${r.reservation_end_time.slice(0, 5)}` : ''}</span>
                  {r.customer_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.customer_phone}</span>}
                </div>
                {(serviceName || specialistName) && (
                  <p className="mt-2 text-sm flex items-center gap-1.5"><Scissors className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />{serviceName ?? '—'}{specialistName ? ` · ${specialistName}` : ''}</p>
                )}
                {pet && (
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5"><PawPrint className="w-3.5 h-3.5" />{[r.pet_name, r.animal_type, r.breed].filter(Boolean).join(' · ')}</p>
                )}
                {r.notes && <p className="mt-1 text-sm text-muted-foreground">{r.notes}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminReservations({ companies }: { companies: BrowserCompany[] }) {
  const t = useT();
  return (
    <AdminCompanyBrowser
      companies={companies}
      title={t['admin.res_companies_title'] ?? 'Company reservations'}
      subtitle={t['admin.res_companies_subtitle'] ?? 'Select a salon to view its booking calendar reservations.'}
      emptyText={t['admin.res_no_companies'] ?? 'No salon companies found'}
    >
      {company => <ReservationsPanel companyId={company.id} />}
    </AdminCompanyBrowser>
  );
}
