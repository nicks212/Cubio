'use client';

import { useState, useTransition, useMemo } from 'react';
import { AlertTriangle, Phone, Mail, FileText, Search, SortAsc, Trash2, CheckCircle2, RotateCcw, X, ChevronDown } from 'lucide-react';
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

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';
type FilterStatus = 'all' | Escalation['status'];

export default function EscalationsClient({ escalations: initial, t }: Props) {
  const [escalations, setEscalations] = useState(initial);
  const [selected, setSelected] = useState<Escalation | null>(null);
  const [, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<Escalation | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const supabase = createClient();

  const updateStatus = (esc: Escalation, status: Escalation['status']) => {
    startTransition(async () => {
      await supabase.from('escalations').update({ status }).eq('id', esc.id);
      setEscalations(prev => prev.map(e => e.id === esc.id ? { ...e, status } : e));
      if (selected?.id === esc.id) setSelected(prev => prev ? { ...prev, status } : null);
    });
  };

  const deleteEscalation = (esc: Escalation) => {
    startTransition(async () => {
      await supabase.from('escalations').delete().eq('id', esc.id);
      setEscalations(prev => prev.filter(e => e.id !== esc.id));
      if (selected?.id === esc.id) setSelected(null);
      setDeleteConfirm(null);
    });
  };

  const filtered = useMemo(() => {
    let list = [...escalations];
    if (filterStatus !== 'all') list = list.filter(e => e.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.contact_name ?? '').toLowerCase().includes(q) ||
        (e.provider_nickname ?? '').toLowerCase().includes(q) ||
        (e.contact_phone ?? '').toLowerCase().includes(q) ||
        (e.contact_email ?? '').toLowerCase().includes(q) ||
        (e.summary ?? '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortKey === 'date_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === 'date_asc')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      const na = (a.contact_name ?? a.provider_nickname ?? '').toLowerCase();
      const nb = (b.contact_name ?? b.provider_nickname ?? '').toLowerCase();
      return sortKey === 'name_asc' ? na.localeCompare(nb) : nb.localeCompare(na);
    });
    return list;
  }, [escalations, search, filterStatus, sortKey]);

  const statusFilterLabels: Record<FilterStatus, string> = {
    all: 'ყველა', open: t['escalations.status_open'],
    resolved: t['escalations.status_resolved'], ignored: t['escalations.status_ignored'],
  };
  const sortLabels: Record<SortKey, string> = {
    date_desc: 'თარიღი (ახალი)', date_asc: 'თარიღი (ძველი)',
    name_asc: 'სახელი A–Z', name_desc: 'სახელი Z–A',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-foreground mb-2">ესკალაციის წაშლა</h3>
            <p className="text-sm text-muted-foreground mb-6">
              დარწმუნებული ხართ, რომ გსურთ წაშალოთ <span className="font-medium text-foreground">{deleteConfirm.contact_name ?? deleteConfirm.provider_nickname ?? 'ეს ჩანაწერი'}</span>? ეს მოქმედება შეუქცევადია.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">გაუქმება</button>
              <button onClick={() => deleteEscalation(deleteConfirm)} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">წაშლა</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-1">{t['escalations.title']}</h1>
        <p className="text-muted-foreground">{t['escalations.subtitle']}</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ძიება სახელით, ტელეფონით, შინაარსით..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
        <div className="relative">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)}
            className="appearance-none pl-3 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer">
            {(Object.keys(statusFilterLabels) as FilterStatus[]).map(k => (
              <option key={k} value={k}>{statusFilterLabels[k]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <SortAsc className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="appearance-none pl-8 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer">
            {(Object.keys(sortLabels) as SortKey[]).map(k => (
              <option key={k} value={k}>{sortLabels[k]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <span className="self-center text-xs text-muted-foreground whitespace-nowrap">{filtered.length} ჩანაწერი</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">{escalations.length === 0 ? t['escalations.no_escalations'] : 'ფილტრი არ დაემთხვა'}</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filtered.map(esc => (
              <button
                key={esc.id}
                onClick={() => setSelected(esc)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${selected?.id === esc.id ? 'border-primary shadow-sm' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
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
                <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{esc.summary}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(esc.created_at)}</p>
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[selected.status]}`}>
                      {t[`escalations.status_${selected.status}`] ?? selected.status}
                    </span>
                    <button
                      onClick={() => setDeleteConfirm(selected)}
                      title="წაშლა"
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {(selected.contact_phone || selected.contact_email) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['escalations.col_contact']}</p>
                      <div className="flex flex-wrap gap-3">
                        {selected.contact_phone && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />{selected.contact_phone}
                          </span>
                        )}
                        {selected.contact_email && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />{selected.contact_email}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['escalations.col_summary']}</p>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-1 border-t border-slate-100">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">მოქმედებები</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.status !== 'resolved' && (
                        <button onClick={() => updateStatus(selected, 'resolved')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" />ქეისის დახურვა
                        </button>
                      )}
                      {selected.status === 'open' && (
                        <button onClick={() => updateStatus(selected, 'ignored')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                          {t['escalations.mark_ignored']}
                        </button>
                      )}
                      {selected.status !== 'open' && (
                        <button onClick={() => updateStatus(selected, 'open')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" />ქეისის ხელახლა გახსნა
                        </button>
                      )}
                      <button onClick={() => setDeleteConfirm(selected)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors ml-auto">
                        <Trash2 className="w-3.5 h-3.5" />წაშლა
                      </button>
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
