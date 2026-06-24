'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Home, Users, BarChart3,
  Menu, X, LogOut, Store, Shield, MessageSquare, Plug, Settings, AlertTriangle,
  Scissors, UserCog, CalendarDays,
} from 'lucide-react';
import { logout } from '@/app/auth/actions';
import { CubioLogo } from '@/components/CubioLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { isProductBusiness, type BusinessType, type Profile } from '@/types/database';
import { useT } from '@/components/TranslationsProvider';
import { createClient } from '@/lib/supabase/client';

interface Props {
  profile: Profile & { company?: { business_type: string | null; company_name: string } | null };
  children: React.ReactNode;
  leadsCount?: number;
  escalationsCount?: number;
  currentLang?: 'ka' | 'en';
}

export default function DashboardLayoutClient({ profile, children, leadsCount = 0, escalationsCount = 0, currentLang = 'ka' }: Props) {
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
  const isProductShop = isProductBusiness(profile.company?.business_type as BusinessType | null);
  const isBeautySalon = profile.company?.business_type === 'beauty_salon';

  const navItems = [
    { path: '/dashboard', label: t['nav.dashboard'], icon: LayoutDashboard, exact: true, badge: 0 },
    { path: '/dashboard/conversations', label: t['nav.conversations'], icon: MessageSquare, badge: 0 },
    // Leads are not relevant for salons (they use reservations) — hidden for beauty_salon.
    ...(isBeautySalon ? [] : [{ path: '/dashboard/leads', label: t['nav.leads'], icon: Users, badge: liveLeads }]),
    { path: '/dashboard/escalations', label: t['nav.escalations'], icon: AlertTriangle, badge: liveEscalations },
    ...(isRealEstate ? [
      { path: '/dashboard/projects', label: t['nav.projects'], icon: Building2, badge: 0 },
      { path: '/dashboard/apartments', label: t['nav.apartments'], icon: Home, badge: 0 },
    ] : []),
    ...(isProductShop ? [
      { path: '/dashboard/products', label: t['nav.products'], icon: Store, badge: 0 },
    ] : []),
    ...(isBeautySalon ? [
      { path: '/dashboard/calendar', label: t['nav.calendar'] ?? 'Calendar', icon: CalendarDays, badge: 0 },
      { path: '/dashboard/services', label: t['nav.services'] ?? 'Services', icon: Scissors, badge: 0 },
      { path: '/dashboard/specialists', label: t['nav.specialists'] ?? 'Specialists', icon: UserCog, badge: 0 },
    ] : []),
    { path: '/dashboard/integrations', label: t['nav.integrations'], icon: Plug, badge: 0 },
    { path: '/dashboard/settings', label: t['nav.settings'], icon: Settings, badge: 0 },
    ...(profile.is_admin ? [{ path: '/dashboard/admin', label: t['nav.admin'], icon: Shield, badge: 0 }] : []),
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + '/');

  // ── Mobile bottom-bar split ─────────────────────────────────────────────────
  // A curated set of primary destinations sit in the bottom tab bar; everything
  // else (plus profile/language/logout) lives in the slide-up "More" sheet.
  const primaryPaths = [
    '/dashboard',
    '/dashboard/conversations',
    isRealEstate ? '/dashboard/apartments' : isProductShop ? '/dashboard/products' : isBeautySalon ? '/dashboard/calendar' : '',
    isBeautySalon ? '/dashboard/services' : '/dashboard/leads',
  ].filter(Boolean);
  const primaryItems = primaryPaths
    .map(p => navItems.find(n => n.path === p))
    .filter((n): n is (typeof navItems)[number] => !!n);
  const moreItems = navItems.filter(n => !primaryItems.includes(n));

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
          <CubioLogo size={36} />
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
          <div className="px-2 mb-1">
            <LanguageSwitcher currentLang={currentLang} />
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

      {/* Mobile Header (mobile only) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <CubioLogo size={28} />
          <span className="font-semibold">Cubio</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label={t['nav.menu'] ?? 'Menu'}
          className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center active:scale-95 transition-transform"
        >
          <span className="text-sm font-semibold text-primary">
            {(profile.full_name ?? profile.email).charAt(0).toUpperCase()}
          </span>
        </button>
      </header>

      {/* Mobile Bottom Tab Bar (mobile only) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {primaryItems.map(({ path, label, icon: Icon, exact, badge }) => {
          const active = isActive(path, exact);
          return (
            <Link
              key={path}
              href={path}
              className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-16 active:bg-slate-50 transition-colors"
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
              <span className="relative">
                <Icon className={`w-6 h-6 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : String(badge)}
                  </span>
                )}
              </span>
              <span className={`text-[11px] leading-none truncate max-w-full px-0.5 ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-16 active:bg-slate-50 transition-colors"
        >
          {mobileOpen && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
          <Menu className={`w-6 h-6 ${mobileOpen ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`text-[11px] leading-none ${mobileOpen ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{t['nav.more'] ?? 'More'}</span>
        </button>
      </nav>

      {/* Mobile "More" Sheet (mobile only) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <span className="font-semibold">{t['nav.menu'] ?? 'Menu'}</span>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            {moreItems.length > 0 && (
              <div className="grid grid-cols-3 gap-2 p-4">
                {moreItems.map(({ path, label, icon: Icon, exact, badge }) => {
                  const active = isActive(path, exact);
                  return (
                    <Link
                      key={path}
                      href={path}
                      onClick={() => setMobileOpen(false)}
                      className={`relative flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border transition-colors ${active ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-muted-foreground active:bg-slate-50'}`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-xs font-medium text-center leading-tight px-1">{label}</span>
                      {badge > 0 && (
                        <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                          {badge > 99 ? '99+' : String(badge)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="px-4 pb-5 border-t border-slate-200">
              <div className="flex items-center gap-3 px-3 py-3 bg-slate-50 rounded-xl my-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {(profile.full_name ?? profile.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profile.company?.company_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                </div>
              </div>
              <div className="mb-3">
                <LanguageSwitcher currentLang={currentLang} />
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-foreground rounded-xl font-medium active:bg-slate-200 transition-colors"
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
      <main className="flex-1 overflow-y-auto pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
