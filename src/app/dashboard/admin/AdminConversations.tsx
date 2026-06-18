'use client';

import { useState, useCallback, useEffect } from 'react';
import { MessageSquare, Search, User, Clock, ChevronRight, ChevronLeft, BotOff, Building2, Loader2 } from 'lucide-react';
import type { Conversation, Message } from '@/types/database';
import { formatDateTime } from '@/lib/utils';
import { useT } from '@/components/TranslationsProvider';
import { adminListConversations, adminListMessages } from './actions';

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
};

const providerBadgeClass: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-purple-100 text-purple-700',
  telegram: 'bg-green-100 text-green-700',
  whatsapp: 'bg-emerald-100 text-emerald-700',
  viber: 'bg-violet-100 text-violet-700',
};
const providerLabel: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
};

interface Props {
  companies: Array<{ id: string; company_name: string }>;
}

export default function AdminConversations({ companies }: Props) {
  const t = useT();
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; company_name: string } | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const openCompany = useCallback(async (company: { id: string; company_name: string }) => {
    setSelectedCompany(company);
    setSelected(null);
    setMessages([]);
    setConversations([]);
    setSearch('');
    setStatusFilter('all');
    setLoadingConvs(true);
    const res = await adminListConversations(company.id);
    setConversations((res.conversations ?? []) as Conversation[]);
    setLoadingConvs(false);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingMsgs(true);
    adminListMessages(selected.id).then(res => {
      if (!active) return;
      setMessages((res.messages ?? []) as Message[]);
      setLoadingMsgs(false);
    });
    return () => { active = false; };
  }, [selected]);

  const filteredCompanies = companies.filter(c =>
    !companySearch.trim() || c.company_name.toLowerCase().includes(companySearch.toLowerCase()),
  );

  const filteredConvs = conversations.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.contact_name?.toLowerCase().includes(search.toLowerCase()) &&
        !c.contact_phone?.includes(search)) return false;
    return true;
  });

  // ── Company picker ───────────────────────────────────────────────
  if (!selectedCompany) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t['admin.conv_companies_title'] ?? 'Company conversations'}</h2>
          <p className="text-sm text-muted-foreground">{t['admin.conv_companies_subtitle'] ?? 'Select a company to view the conversations it has with its customers.'}</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-200">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
            placeholder={t['admin.conv_search_companies'] ?? 'Search companies...'}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {filteredCompanies.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{t['admin.conv_no_companies'] ?? 'No companies found'}</div>
          ) : filteredCompanies.map(c => (
            <button
              key={c.id}
              onClick={() => openCompany(c)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-slate-500" />
              </div>
              <span className="flex-1 font-medium text-sm">{c.company_name}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Conversations view for the selected company ──────────────────
  return (
    <div>
      <button
        onClick={() => { setSelectedCompany(null); setSelected(null); setConversations([]); setMessages([]); }}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        {t['admin.conv_back_to_companies'] ?? 'All companies'}
      </button>

      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{selectedCompany.company_name}</h2>
      </div>

      <div className="flex h-[calc(100vh-280px)] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Sidebar */}
        <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-200`}>
          <div className="p-4 border-b border-slate-200">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t['conversations.search'] ?? 'Search...'}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'open', 'pending', 'closed'] as const).map(s => {
                const labels: Record<string, string> = { all: t['conversations.all'] ?? 'All', open: t['conversations.open'] ?? 'Open', pending: t['conversations.pending'] ?? 'Pending', closed: t['conversations.closed'] ?? 'Closed' };
                return (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-primary text-white' : 'bg-slate-100 text-muted-foreground hover:bg-slate-200'}`}>
                    {labels[s] ?? s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConvs ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t['conversations.no_conversations'] ?? 'No conversations'}</p>
              </div>
            ) : filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelected(conv)}
                className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selected?.id === conv.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm truncate">{conv.contact_name ?? conv.contact_phone ?? 'Unknown'}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${providerBadgeClass[conv.provider] ?? 'bg-slate-100 text-slate-600'}`}>
                        {providerLabel[conv.provider] ?? conv.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[conv.status] ?? ''}`}>
                        {conv.status}
                      </span>
                      {conv.ai_paused && (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                          <BotOff className="w-3 h-3" />
                          {t['conversations.ai_paused'] ?? 'AI off'}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />{formatDateTime(conv.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread (read-only) */}
        <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col flex-1 bg-[var(--muted)]`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">{t['conversations.select_hint'] ?? 'Select a conversation'}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="md:hidden p-1.5 hover:bg-slate-100 rounded-lg">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{selected.contact_name ?? selected.contact_phone ?? 'Unknown'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${providerBadgeClass[selected.provider] ?? 'bg-slate-100 text-slate-600'}`}>
                      {providerLabel[selected.provider] ?? selected.provider}
                    </span>
                    <span className="text-xs text-muted-foreground">{selected.status}</span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>
                ) : messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'agent' ? 'bg-primary text-white rounded-br-sm' : msg.role === 'ai' ? 'bg-blue-100 text-blue-900 rounded-bl-sm' : 'bg-white border border-slate-200 rounded-bl-sm'}`}>
                      {msg.role === 'ai' && <p className="text-xs font-medium mb-1 opacity-70">{t['conversations.ai_assistant'] ?? 'AI assistant'}</p>}
                      {msg.content}
                      <p className={`text-xs mt-1 ${msg.role === 'agent' ? 'text-white/70' : 'text-muted-foreground'}`}>{formatDateTime(msg.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Read-only notice */}
              <div className="bg-white border-t border-slate-200 px-4 py-3 text-center text-xs text-muted-foreground">
                {t['admin.conv_readonly'] ?? 'Read-only view — admin monitoring'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
