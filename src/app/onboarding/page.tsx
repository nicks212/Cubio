'use client';

import { useActionState, useState } from 'react';
import { Box, Building2, Gem, CheckCircle2, LogOut } from 'lucide-react';
import { setupCompany } from './actions';
import { logout } from '@/app/auth/actions';
import { useT } from '@/components/TranslationsProvider';

export default function OnboardingPage() {
  const t = useT();
  const [state, action, pending] = useActionState(setupCompany, null);
  const [selected, setSelected] = useState<string | null>(null);

  const businessProfiles = [
    {
      id: 'real_estate',
      title: t['onboarding.re_title'],
      description: t['onboarding.re_desc'],
      icon: Building2,
      color: 'bg-blue-500',
      features: [t['onboarding.feat_projects'], t['onboarding.feat_apartments'], t['onboarding.feat_leads'], t['onboarding.feat_ai_sales']],
    },
    {
      id: 'craft_shop',
      title: t['onboarding.craft_title'],
      description: t['onboarding.craft_desc'],
      icon: Gem,
      color: 'bg-purple-500',
      features: [t['onboarding.feat_products'], t['onboarding.feat_birthstone'], t['onboarding.feat_zodiac'], t['onboarding.feat_inventory']],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Box className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold">Cubio</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t['onboarding.title']}</h1>
          <p className="text-muted-foreground">{t['onboarding.subtitle']}</p>
        </div>

        <div className="flex justify-end mb-6">
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t['onboarding.sign_out']}
            </button>
          </form>
        </div>

        {state?.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
            {state.error}
          </div>
        )}

        <form action={action} className="space-y-8">
          {/* Company name */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <label htmlFor="companyName" className="block text-sm font-medium text-foreground mb-2">
              {t['onboarding.company_name']}
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              className="w-full px-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              placeholder={t['onboarding.company_placeholder']}
              required
            />
          </div>

          {/* Business type */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground px-1">{t['onboarding.select_type']}</p>
            <input type="hidden" name="businessType" value={selected ?? ''} />
            <div className="grid md:grid-cols-2 gap-4">
              {businessProfiles.map((profile) => {
                const Icon = profile.icon;
                const isSelected = selected === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelected(profile.id)}
                    className={`bg-white rounded-2xl border-2 p-6 text-left transition-all ${
                      isSelected
                        ? 'border-primary shadow-md ring-2 ring-primary/20'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`w-12 h-12 ${profile.color} rounded-xl flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">{profile.title}</h3>
                    <p className="text-muted-foreground text-sm mb-4">{profile.description}</p>
                    <div className="space-y-1.5">
                      {profile.features.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-green-500'}`} />
                          {f}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={pending || !selected}
            className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? t['onboarding.setting_up'] : t['onboarding.get_started']}
          </button>
        </form>
      </div>
    </div>
  );
}
