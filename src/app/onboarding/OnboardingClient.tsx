'use client';

import { useActionState, useState } from 'react';
import { Box, Building2, Gem, CheckCircle2, LogOut, FileText, X, ChevronDown } from 'lucide-react';
import { setupCompany } from './actions';
import { logout } from '@/app/auth/actions';
import { useT } from '@/components/TranslationsProvider';

interface Props {
  termsKa: string;
  termsEn: string;
}

export default function OnboardingClient({ termsKa, termsEn }: Props) {
  const t = useT();
  const [state, action, pending] = useActionState(setupCompany, null);
  const [selected, setSelected] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsLang, setTermsLang] = useState<'ka' | 'en'>('ka');

  const termsContent = termsLang === 'ka' ? termsKa : termsEn;

  const businessProfiles = [
    {
      id: 'real_estate',
      title: t['onboarding.re_title'],
      description: t['onboarding.re_desc'],
      icon: Building2,
      color: 'bg-blue-500',
      features: [
        t['onboarding.feat_projects'],
        t['onboarding.feat_apartments'],
        t['onboarding.feat_leads'],
        t['onboarding.feat_ai_sales'],
      ],
    },
    {
      id: 'craft_shop',
      title: t['onboarding.craft_title'],
      description: t['onboarding.craft_desc'],
      icon: Gem,
      color: 'bg-purple-500',
      features: [
        t['onboarding.feat_products'],
        t['onboarding.feat_birthstone'],
        t['onboarding.feat_zodiac'],
        t['onboarding.feat_inventory'],
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Logo + Title */}
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

        {/* Sign out */}
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

        <form action={action} className="space-y-6">
          {/* Step 1: Company name */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
              <label htmlFor="companyName" className="text-sm font-semibold text-foreground">
                {t['onboarding.company_name']}
              </label>
            </div>
            <input
              id="companyName"
              name="companyName"
              type="text"
              className="w-full px-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              placeholder={t['onboarding.company_placeholder']}
              required
            />
          </div>

          {/* Step 2: Business type */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
              <p className="text-sm font-semibold text-foreground">{t['onboarding.select_type']}</p>
            </div>
            <input type="hidden" name="businessType" value={selected ?? ''} />
            <div className="grid sm:grid-cols-2 gap-4">
              {businessProfiles.map((profile) => {
                const Icon = profile.icon;
                const isSelected = selected === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelected(profile.id)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      isSelected
                        ? 'border-primary shadow-md ring-2 ring-primary/20'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`w-9 h-9 ${profile.color} rounded-xl flex items-center justify-center mb-2`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-base font-bold mb-1.5">{profile.title}</h3>
                    <div className="flex items-start gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-px text-green-500" />
                      <span>{profile.features.join(', ')}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Business description */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
              <label htmlFor="businessDescription" className="text-sm font-semibold text-foreground">
                {t['onboarding.business_description']}
              </label>
            </div>
            <textarea
              id="businessDescription"
              name="businessDescription"
              maxLength={1000}
              rows={4}
              placeholder={t['onboarding.business_description_placeholder']}
              className="w-full px-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">მაქს. 1000 სიმბოლო</p>
          </div>

          {/* Step 4: Terms agreement */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">4</span>
              <p className="text-sm font-semibold text-foreground">{t['onboarding.terms_section']}</p>
            </div>
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={termsAgreed}
                onClick={() => {
                  if (!termsAgreed) {
                    setTermsOpen(true);
                  } else {
                    setTermsAgreed(false);
                  }
                }}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                  termsAgreed
                    ? 'bg-primary border-primary'
                    : 'border-slate-300 hover:border-primary'
                }`}
              >
                {termsAgreed && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div>
                <span className="text-sm text-muted-foreground">
                  {t['onboarding.terms_agree_label']}{' '}
                </span>
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {t['onboarding.terms_read_link']}
                </button>
              </div>
            </div>
            {state?.error && state.error === 'terms_required' && (
              <p className="mt-2 text-xs text-red-600">{t['onboarding.terms_required']}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={pending || !selected || !termsAgreed}
            className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? t['onboarding.setting_up'] : t['onboarding.get_started']}
          </button>
        </form>
      </div>

      {/* Terms Pullup Sheet */}
      {termsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/50 cursor-pointer"
            onClick={() => setTermsOpen(false)}
          />
          {/* Sheet */}
          <div className="bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[80vh]">
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-foreground">
                {t['onboarding.terms_modal_title']}
              </h2>
              <div className="flex items-center gap-3">
                {/* Language switcher */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setTermsLang('ka')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      termsLang === 'ka' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    ქარ
                  </button>
                  <button
                    type="button"
                    onClick={() => setTermsLang('en')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      termsLang === 'en' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    ENG
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setTermsOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sheet content */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
              {termsContent ? (
                <div
                  className={[
                    'text-foreground leading-relaxed text-sm',
                    '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3',
                    '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2',
                    '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1',
                    '[&_p]:mb-3 [&_p]:leading-6',
                    '[&_strong]:font-semibold [&_em]:italic [&_u]:underline',
                  ].join(' ')}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: termsContent }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ChevronDown className="w-8 h-8 text-muted-foreground mb-3 opacity-30" />
                  <p className="text-muted-foreground">{t['onboarding.terms_empty']}</p>
                </div>
              )}
            </div>

            {/* Agree button */}
            <div className="flex-shrink-0 px-5 pb-6 pt-4 border-t border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => {
                  setTermsAgreed(true);
                  setTermsOpen(false);
                }}
                className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold text-base hover:bg-primary/90 transition-colors"
              >
                {t['onboarding.terms_agree_btn']}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
