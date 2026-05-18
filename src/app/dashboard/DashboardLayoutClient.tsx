'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box, LayoutDashboard, Building2, Home, Users, BarChart3,
  Menu, X, LogOut, Gem, Shield, MessageSquare, Plug, Settings, AlertTriangle,
} from 'lucide-react';
import { logout } from '@/app/auth/actions';
import type { Profile } from '@/types/database';
import { useT } from '@/components/TranslationsProvider';
import { createClient } from '@/lib/supabase/client';

interface Props {
  profile: Profile & { company?: { business_type: string | null; company_name: string } | null };
  children: React.ReactNode;
  leadsCount?: number;
  escalationsCount?: number;
}

export default function DashboardLayoutClient({ profile, children, leadsCount = 0, escalationsCount = 0 }: Props) {
  const t = useT();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveLeads, setLiveLeads] = useState(leadsCount);
  const [liveEscalations, setLiveEscalations] = useState(escalationsCount);

  const companyId = profile.company_id;

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();

    const fetchCounts = async () => {
      const [leadsRes, escRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['new', 'contacted', 'scheduled']),
        supabase
          .from('escalations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'open'),
      ]);
      if (leadsRes.error) console.error('[nav-badges] leads fetch error:', leadsRes.error);
      if (escRes.error) console.error('[nav-badges] esc fetch error:', escRes.error);
      setLiveLeads(leadsRes.count ?? 0);
      setLiveEscalations(escRes.count ?? 0);
    };

    // Immediate fetch on mount so counts are always fresh
    void fetchCounts();

    // ── Instant same-tab updates ──────────────────────────────────────────────
    // EscalationsClient / LeadsClient dispatch this after every status change.
    // This bypasses Supabase Realtime UPDATE limitations (needs REPLICA IDENTITY
    // FULL for UPDATE events to pass through RLS — not required here).
    const onCountsChanged = () => { void fetchCounts(); };
    window.addEventListener('cubio:counts-changed', onCountsChanged);

    // ── Visibility refetch ────────────────────────────────────────────────────
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchCounts();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // ── Polling fallback (cross-tab / reconnect safety net) ───────────────────
    const interval = setInterval(() => { void fetchCounts(); }, 15_000);

    // ── Realtime (handles INSERT from AI pipeline in other tabs/server) ───────
    const channel = supabase
      .channel(`nav-badges-${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' },
        () => { void fetchCounts(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'escalations' },
        () => { void fetchCounts(); })
      .subscribe((status, err) => {
        if (err) console.error('[nav-badges] realtime error:', err);
        else console.info('[nav-badges] realtime status:', status);
      });

    return () => {
      window.removeEventListener('cubio:counts-changed', onCountsChanged);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  const isRealEstate = profile.company?.business_type === 'real_estate';
  const isCraftShop = profile.company?.business_type === 'craft_shop';

  const navItems = [
    { path: '/dashboard', label: t['nav.dashboard'], icon: LayoutDashboard, exact: true, badge: 0 },
    { path: '/dashboard/conversations', label: t['nav.conversations'], icon: MessageSquare, badge: 0 },
    { path: '/dashboard/leads', label: t['nav.leads'], icon: Users, badge: liveLeads },
    { path: '/dashboard/escalations', label: t['nav.escalations'], icon: AlertTriangle, badge: liveEscalations },
    ...(isRealEstate ? [
      { path: '/dashboard/projects', label: t['nav.projects'], icon: Building2, badge: 0 },
      { path: '/dashboard/apartments', label: t['nav.apartments'], icon: Home, badge: 0 },
    ] : []),
    ...(isCraftShop ? [
      { path: '/dashboard/products', label: t['nav.products'], icon: Gem, badge: 0 },
    ] : []),
    { path: '/dashboard/integrations', label: t['nav.integrations'], icon: Plug, badge: 0 },
    { path: '/dashboard/settings', label: t['nav.settings'], icon: Settings, badge: 0 },
    ...(profile.is_admin ? [{ path: '/dashboard/admin', label: t['nav.admin'], icon: Shield, badge: 0 }] : []),
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + '/');

  const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map(({ path, label, icon: Icon, exact, badge }) => (
        <Link
          key={path}
          href={path}
          onClick={onNavigate}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            isActive(path, exact)
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
          }`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium flex-1">{label}</span>
          {badge > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
              {badge > 99 ? '99+' : String(badge)}
            </span>
          )}
        </Link>
      ))}
    </>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 flex-shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Box className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold">Cubio</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItems />
        </nav>
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg mb-2">
            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary">
                {(profile.full_name ?? profile.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile.company?.company_name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">{t['nav.sign_out']}</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Box className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold">Cubio</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-16 left-0 right-0 bottom-0 bg-white flex flex-col" onClick={e => e.stopPropagation()}>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="p-4 border-t border-slate-200">
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg mb-2">
                <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {(profile.full_name ?? profile.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profile.company?.company_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                </div>
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">{t['nav.sign_out']}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
