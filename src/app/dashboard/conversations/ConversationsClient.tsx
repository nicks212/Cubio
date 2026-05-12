'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, Send, User, Clock, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Conversation, Message } from '@/types/database';
import { formatDateTime } from '@/lib/utils';

const statusColors = {
  open: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
};

const providerIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📸',
  telegram: '✈️',
  whatsapp: '💬',
  viber: '📱',
};

interface Props {
  conversations: Conversation[];
  companyId: string;
}

export default function ConversationsClient({ conversations: initial, companyId }: Props) {
  const [conversations, setConversations] = useState(initial);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newMessage, setNewMessage] = useState('');
  const supabase = createClient();

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at');
    setMessages(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected, loadMessages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('conversations')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: selected ? `conversation_id=eq.${selected.id}` : undefined,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected, supabase]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selected) return;
    const { data } = await supabase.from('messages').insert({
      conversation_id: selected.id,
      company_id: companyId,
      role: 'agent',
      content: newMessage.trim(),
    }).select().single();
    if (data) setMessages(prev => [...prev, data]);
    setNewMessage('');
  };

  const filtered = conversations.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.contact_name?.toLowerCase().includes(search.toLowerCase()) &&
        !c.contact_phone?.includes(search)) return false;
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Sidebar */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white`}>
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-xl font-bold mb-3">Conversations</h1>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'open', 'pending', 'closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-primary text-white' : 'bg-slate-100 text-muted-foreground hover:bg-slate-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No conversations</p>
            </div>
          ) : filtered.map(conv => (
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
                    <span className="text-xs text-muted-foreground">{providerIcons[conv.provider] ?? '💬'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[conv.status as keyof typeof statusColors] ?? ''}`}>
                      {conv.status}
                    </span>
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

      {/* Thread */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col flex-1 bg-[var(--muted)]`}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Select a conversation</p>
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
              <div>
                <p className="font-semibold text-sm">{selected.contact_name ?? selected.contact_phone ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground capitalize">{selected.provider} · {selected.status}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'agent' ? 'bg-primary text-white rounded-br-sm' : msg.role === 'ai' ? 'bg-blue-100 text-blue-900 rounded-bl-sm' : 'bg-white border border-slate-200 rounded-bl-sm'}`}>
                    {msg.role === 'ai' && <p className="text-xs font-medium mb-1 opacity-70">AI Assistant</p>}
                    {msg.content}
                    <p className={`text-xs mt-1 ${msg.role === 'agent' ? 'text-white/70' : 'text-muted-foreground'}`}>{formatDateTime(msg.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="bg-white border-t border-slate-200 p-4">
              <div className="flex gap-3">
                <input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button onClick={handleSend} disabled={!newMessage.trim()} className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
