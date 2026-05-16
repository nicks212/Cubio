'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Phone, Mail, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Escalation } from '@/types/database';
import type { T } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';

const statusColors: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  ignored: 'bg-slate-100 text-slate-500',
};

interface Props {
  escalations: Escalation[];
  t: T;
}

export default function EscalationsClient({ escalations: initial, t }: Props) {
  const [escalations, setEscalations] = useState(initial);
  const [selected, setSelected] = useState<Escalation | null>(null);
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const updateStatus = (esc: Escalation, status: Escalation['status']) => {
    startTransition(async () => {
      await supabase.from('escalations').update({ status }).eq('id', esc.id);
      setEscalations(prev => prev.map(e => e.id === esc.id ? { ...e, status } : e));
      if (selected?.id === esc.id) setSelected({ ...esc, status });
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t['escalations.title']}</h1>
        <p className="text-muted-foreground">{t['escalations.subtitle']}</p>
      </div>

      {escalations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">{t['escalations.no_escalations']}</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {escalations.map(esc => (
              <button
                key={esc.id}
                onClick={() => setSelected(esc)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${selected?.id === esc.id ? 'border-primary shadow-sm' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="font-medium text-sm truncate">
                      {esc.contact_name ?? esc.provider_nickname ?? 'Unknown'}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[esc.status]}`}>
                    {t[`escalations.status_${esc.status}`] ?? esc.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{esc.summary}</p>
                <p className="text-xs text-muted-foreground mt-2">{formatDateTime(esc.created_at)}</p>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center h-full flex items-center justify-center">
                <div>
                  <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">აირჩიეთ ესკალაცია დეტალების სანახავად</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">
                        {selected.contact_name ?? selected.provider_nickname ?? 'Unknown'}
                      </h2>
                      <p className="text-xs text-muted-foreground">{formatDateTime(selected.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusColors[selected.status]}`}>
                    {t[`escalations.status_${selected.status}`] ?? selected.status}
                  </span>
                </div>

                <div className="p-5 space-y-5">
                  {/* Contact info */}
                  {(selected.contact_phone || selected.contact_email) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['escalations.col_contact']}</p>
                      <div className="flex flex-wrap gap-3">
                        {selected.contact_phone && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {selected.contact_phone}
                          </span>
                        )}
                        {selected.contact_email && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            {selected.contact_email}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['escalations.col_summary']}</p>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>
                    </div>
                  </div>

                  {/* Status actions */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['escalations.col_status']}</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.status !== 'resolved' && (
                        <button
                          onClick={() => updateStatus(selected, 'resolved')}
                          className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        >
                          {t['escalations.mark_resolved']}
                        </button>
                      )}
                      {selected.status === 'open' && (
                        <button
                          onClick={() => updateStatus(selected, 'ignored')}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          {t['escalations.mark_ignored']}
                        </button>
                      )}
                      {selected.status !== 'open' && (
                        <button
                          onClick={() => updateStatus(selected, 'open')}
                          className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                        >
                          ხელახლა გახსნა
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
