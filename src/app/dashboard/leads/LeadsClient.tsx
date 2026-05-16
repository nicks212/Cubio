'use client';

import { useState, useTransition } from 'react';
import { Users, Calendar, FileText, Phone, Mail, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Lead } from '@/types/database';
import type { T } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-purple-100 text-purple-700',
  closed: 'bg-green-100 text-green-700',
};

interface Props {
  leads: Lead[];
  t: T;
}

export default function LeadsClient({ leads: initial, t }: Props) {
  const [leads, setLeads] = useState(initial);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const updateStatus = (lead: Lead, status: Lead['status']) => {
    startTransition(async () => {
      await supabase.from('leads').update({ status }).eq('id', lead.id);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status } : l));
      if (selected?.id === lead.id) setSelected({ ...lead, status });
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t['leads.title']}</h1>
        <p className="text-muted-foreground">{t['leads.subtitle']}</p>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">{t['leads.no_leads']}</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {leads.map(lead => (
              <button
                key={lead.id}
                onClick={() => setSelected(lead)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${selected?.id === lead.id ? 'border-primary shadow-sm' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {(lead.name ?? lead.provider_nickname ?? '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-medium text-sm truncate">
                      {lead.name ?? lead.provider_nickname ?? 'Unknown'}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[lead.status]}`}>
                    {t[`leads.status_${lead.status}`] ?? lead.status}
                  </span>
                </div>
                {lead.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{lead.summary}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">{formatDateTime(lead.created_at)}</p>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center h-full flex items-center justify-center">
                <div>
                  <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">აირჩიეთ ლიდი დეტალების სანახავად</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-base font-bold text-primary">
                        {(selected.name ?? selected.provider_nickname ?? '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">
                        {selected.name ?? selected.provider_nickname ?? 'Unknown'}
                      </h2>
                      <p className="text-xs text-muted-foreground">{formatDateTime(selected.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusColors[selected.status]}`}>
                    {t[`leads.status_${selected.status}`] ?? selected.status}
                  </span>
                </div>

                <div className="p-5 space-y-5">
                  {/* Contact info */}
                  {(selected.phone || selected.email) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_contact']}</p>
                      <div className="flex flex-wrap gap-3">
                        {selected.phone && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {selected.phone}
                          </span>
                        )}
                        {selected.email && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            {selected.email}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Conversation summary */}
                  {selected.summary && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_summary']}</p>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>
                      </div>
                    </div>
                  )}

                  {/* Meeting info */}
                  {(selected.meeting_date || selected.meeting_notes) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_meeting']}</p>
                      <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                        {selected.meeting_date && (
                          <span className="flex items-center gap-2 text-sm text-blue-800">
                            <Calendar className="w-3.5 h-3.5" />
                            {selected.meeting_date}
                          </span>
                        )}
                        {selected.meeting_notes && (
                          <span className="flex items-center gap-2 text-sm text-blue-700">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {selected.meeting_notes}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interest */}
                  {selected.interest && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">ინტერესი</p>
                      <p className="text-sm text-foreground bg-slate-50 rounded-lg p-3">{selected.interest}</p>
                    </div>
                  )}

                  {/* Status actions */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_status']}</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.status !== 'contacted' && (
                        <button onClick={() => updateStatus(selected, 'contacted')} className="px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">
                          {t['leads.mark_contacted']}
                        </button>
                      )}
                      {selected.status !== 'scheduled' && (
                        <button onClick={() => updateStatus(selected, 'scheduled')} className="px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors">
                          {t['leads.mark_scheduled']}
                        </button>
                      )}
                      {selected.status !== 'closed' && (
                        <button onClick={() => updateStatus(selected, 'closed')} className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">
                          {t['leads.mark_closed']}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
