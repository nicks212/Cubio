'use client';

import { useState, useEffect } from 'react';
import { Loader2, User, Phone, Mail, Clock, AlertTriangle } from 'lucide-react';
import type { Escalation } from '@/types/database';
import { formatDateTime } from '@/lib/utils';
import { useT } from '@/components/TranslationsProvider';
import AdminCompanyBrowser, { type BrowserCompany } from './AdminCompanyBrowser';
import { adminListEscalations } from './actions';

const statusColors: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  ignored: 'bg-slate-100 text-slate-500',
};

function EscalationsPanel({ companyId }: { companyId: string }) {
  const t = useT();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminListEscalations(companyId).then(res => {
      if (!active) return;
      setEscalations((res.escalations ?? []) as Escalation[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [companyId]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  if (escalations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{t['escalations.empty'] ?? 'No escalations yet'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {escalations.map(esc => (
        <div key={esc.id} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <p className="font-medium text-sm">{esc.contact_name ?? esc.provider_nickname ?? 'Unknown'}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[esc.status] ?? 'bg-slate-100 text-slate-600'}`}>{esc.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {esc.contact_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{esc.contact_phone}</span>}
                {esc.contact_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{esc.contact_email}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(esc.created_at)}</span>
              </div>
              {esc.summary && (
                <div className="mt-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">{esc.summary}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminEscalations({ companies }: { companies: BrowserCompany[] }) {
  const t = useT();
  return (
    <AdminCompanyBrowser
      companies={companies}
      title={t['admin.esc_companies_title'] ?? 'Company escalations'}
      subtitle={t['admin.esc_companies_subtitle'] ?? 'Select a company to view the customers its AI escalated to a human.'}
      emptyText={t['admin.esc_no_companies'] ?? 'No companies found'}
    >
      {company => <EscalationsPanel companyId={company.id} />}
    </AdminCompanyBrowser>
  );
}
