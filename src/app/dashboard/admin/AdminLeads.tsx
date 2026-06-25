'use client';

import { useState, useEffect } from 'react';
import { Loader2, User, Phone, Mail, Clock, Target, CalendarClock, Sparkles, Tag } from 'lucide-react';
import type { Lead } from '@/types/database';
import { formatDateTime } from '@/lib/utils';
import { useT } from '@/components/TranslationsProvider';
import AdminCompanyBrowser, { type BrowserCompany } from './AdminCompanyBrowser';
import { adminListLeads } from './actions';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-purple-100 text-purple-700',
  closed: 'bg-slate-100 text-slate-500',
};

function LeadsPanel({ companyId }: { companyId: string }) {
  const t = useT();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminListLeads(companyId).then(res => {
      if (!active) return;
      setLeads((res.leads ?? []) as Lead[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [companyId]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Target className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{t['leads.empty'] ?? 'No leads yet'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map(lead => (
        <div key={lead.id} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <p className="font-medium text-sm">{lead.name ?? lead.provider_nickname ?? 'Unknown'}</p>
                <div className="flex items-center gap-2">
                  {lead.ai_handled && (
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      <Sparkles className="w-3 h-3" />AI
                    </span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[lead.status] ?? 'bg-slate-100 text-slate-600'}`}>{lead.status}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(lead.created_at)}</span>
              </div>
              {lead.interest && <p className="mt-2 text-sm flex items-start gap-1.5"><Tag className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />{lead.interest}</p>}
              {lead.summary && <p className="mt-1 text-sm text-muted-foreground">{lead.summary}</p>}
              {lead.meeting_date && (
                <p className="mt-2 text-xs text-purple-700 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />{lead.meeting_date}{lead.meeting_notes ? ` — ${lead.meeting_notes}` : ''}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminLeads({ companies }: { companies: BrowserCompany[] }) {
  const t = useT();
  return (
    <AdminCompanyBrowser
      companies={companies}
      title={t['admin.leads_companies_title'] ?? 'Company leads'}
      subtitle={t['admin.leads_companies_subtitle'] ?? 'Select a company to view the leads its AI has captured.'}
      emptyText={t['admin.leads_no_companies'] ?? 'No companies with leads'}
    >
      {company => <LeadsPanel companyId={company.id} />}
    </AdminCompanyBrowser>
  );
}
