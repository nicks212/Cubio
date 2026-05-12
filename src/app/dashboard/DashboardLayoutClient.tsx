'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box, LayoutDashboard, Building2, Home, Users, BarChart3,
  Menu, X, LogOut, Gem, Shield, MessageSquare, Plug, Settings,
} from 'lucide-react';
import { logout } from '@/app/auth/actions';
import type { Profile } from '@/types/database';
import { useT } from '@/components/TranslationsProvider';

interface Props {
  profile: Profile & { company?: { business_type: string | null; company_name: string } | null };
  children: React.ReactNode;
}

export default function DashboardLayoutClient({ profile, children }: Props) {
  const t = useT();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isRealEstate = profile.company?.business_type === 'real_estate';
  const isCraftShop = profile.company?.business_type === 'craft_shop';

  const navItems = [
    { path: '/dashboard', label: t['nav.dashboard'], icon: LayoutDashboard, exact: true },
    { path: '/dashboard/conversations', label: t['nav.conversations'], icon: MessageSquare },
    ...(isRealEstate ? [
      { path: '/dashboard/projects', label: t['nav.projects'], icon: Building2 },
      { path: '/dashboard/apartments', label: t['nav.apartments'], icon: Home },
    ] : []),
    ...(isCraftShop ? [
      { path: '/dashboard/products', label: t['nav.products'], icon: Gem },
    ] : []),
    { path: '/dashboard/integrations', label: t['nav.integrations'], icon: Plug },
    { path: '/dashboard/settings', label: t['nav.settings'], icon: Settings },
    ...(profile.is_admin ? [{ path: '/dashboard/admin', label: t['nav.admin'], icon: Shield }] : []),
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + '/');

  const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map(({ path, label, icon: Icon, exact }) => (
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
          <span className="text-sm font-medium">{label}</span>
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
