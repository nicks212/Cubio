'use client';

import { useState, useTransition, useMemo } from 'react';
import { Users, Calendar, FileText, Phone, Mail, MessageSquare, Search, SortAsc, Trash2, CheckCircle2, RotateCcw, X, ChevronDown } from 'lucide-react';
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

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';
type FilterStatus = 'all' | Lead['status'];

export default function LeadsClient({ leads: initial, t }: Props) {
  const [leads, setLeads] = useState(initial);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<Lead | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const supabase = createClient();

  const updateStatus = (lead: Lead, status: Lead['status']) => {
    startTransition(async () => {
      await supabase.from('leads').update({ status }).eq('id', lead.id);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status } : l));
      if (selected?.id === lead.id) setSelected(prev => prev ? { ...prev, status } : null);
    });
  };

  const deleteLead = (lead: Lead) => {
    startTransition(async () => {
      await supabase.from('leads').delete().eq('id', lead.id);
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      if (selected?.id === lead.id) setSelected(null);
      setDeleteConfirm(null);
    });
  };

  const filtered = useMemo(() => {
    let list = [...leads];
    if (filterStatus !== 'all') list = list.filter(l => l.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        (l.name ?? '').toLowerCase().includes(q) ||
        (l.provider_nickname ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.summary ?? '').toLowerCase().includes(q) ||
        (l.interest ?? '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortKey === 'date_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === 'date_asc')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      const na = (a.name ?? a.provider_nickname ?? '').toLowerCase();
      const nb = (b.name ?? b.provider_nickname ?? '').toLowerCase();
      return sortKey === 'name_asc' ? na.localeCompare(nb) : nb.localeCompare(na);
    });
    return list;
  }, [leads, search, filterStatus, sortKey]);

  const statusFilterLabels: Record<FilterStatus, string> = {
    all: 'ყველა', new: t['leads.status_new'], contacted: t['leads.status_contacted'],
    scheduled: t['leads.status_scheduled'], closed: t['leads.status_closed'],
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
            <h3 className="font-semibold text-foreground mb-2">ლიდის წაშლა</h3>
            <p className="text-sm text-muted-foreground mb-6">
              დარწმუნებული ხართ, რომ გსურთ წაშალოთ <span className="font-medium text-foreground">{deleteConfirm.name ?? deleteConfirm.provider_nickname ?? 'ეს ლიდი'}</span>? ეს მოქმედება შეუქცევადია.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">გაუქმება</button>
              <button onClick={() => deleteLead(deleteConfirm)} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">წაშლა</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-1">{t['leads.title']}</h1>
        <p className="text-muted-foreground">{t['leads.subtitle']}</p>
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
          <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">{leads.length === 0 ? t['leads.no_leads'] : 'ფილტრი არ დაემთხვა'}</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filtered.map(lead => (
              <button
                key={lead.id}
                onClick={() => setSelected(lead)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${selected?.id === lead.id ? 'border-primary shadow-sm' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
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
                {lead.summary && <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{lead.summary}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(lead.created_at)}</p>
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[selected.status]}`}>
                      {t[`leads.status_${selected.status}`] ?? selected.status}
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
                  {(selected.phone || selected.email) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_contact']}</p>
                      <div className="flex flex-wrap gap-3">
                        {selected.phone && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />{selected.phone}
                          </span>
                        )}
                        {selected.email && (
                          <span className="flex items-center gap-1.5 text-sm text-foreground bg-slate-50 rounded-lg px-3 py-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />{selected.email}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {selected.summary && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_summary']}</p>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>
                      </div>
                    </div>
                  )}

                  {(selected.meeting_date || selected.meeting_notes) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t['leads.col_meeting']}</p>
                      <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                        {selected.meeting_date && (
                          <span className="flex items-center gap-2 text-sm text-blue-800">
                            <Calendar className="w-3.5 h-3.5" />{selected.meeting_date}
                          </span>
                        )}
                        {selected.meeting_notes && (
                          <span className="flex items-center gap-2 text-sm text-blue-700">
                            <MessageSquare className="w-3.5 h-3.5" />{selected.meeting_notes}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {selected.interest && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">ინტერესი</p>
                      <p className="text-sm text-foreground bg-slate-50 rounded-lg p-3">{selected.interest}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-1 border-t border-slate-100">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">მოქმედებები</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.status !== 'contacted' && selected.status !== 'closed' && (
                        <button onClick={() => updateStatus(selected, 'contacted')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">
                          {t['leads.mark_contacted']}
                        </button>
                      )}
                      {selected.status !== 'scheduled' && selected.status !== 'closed' && (
                        <button onClick={() => updateStatus(selected, 'scheduled')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors">
                          {t['leads.mark_scheduled']}
                        </button>
                      )}
                      {selected.status !== 'closed' && (
                        <button onClick={() => updateStatus(selected, 'closed')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" />ქეისის დახურვა
                        </button>
                      )}
                      {selected.status === 'closed' && (
                        <button onClick={() => updateStatus(selected, 'new')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">
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
