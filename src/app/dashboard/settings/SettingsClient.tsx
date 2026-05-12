'use client';

import { useActionState } from 'react';
import { User, Building2, Lock, CheckCircle } from 'lucide-react';
import { updateProfile, updateCompany, changePassword } from './actions';
import type { Profile, Company } from '@/types/database';
import { useT } from '@/components/TranslationsProvider';

interface Props {
  profile: Profile | null;
  company: Company | null;
  email: string;
}

function SuccessMsg({ state, savedLabel }: { state: { success?: boolean; error?: string } | null; savedLabel: string }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.success) return <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />{savedLabel}</p>;
  return null;
}

export default function SettingsClient({ profile, company, email }: Props) {
  const t = useT();
  const [profileState, profileAction, profilePending] = useActionState(updateProfile, null);
  const [companyState, companyAction, companyPending] = useActionState(updateCompany, null);
  const [pwState, pwAction, pwPending] = useActionState(changePassword, null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t['settings.title']}</h1>
        <p className="text-muted-foreground">{t['settings.subtitle']}</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold">{t['settings.profile']}</h2>
        </div>
        <form action={profileAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t['settings.full_name']}</label>
            <input name="full_name" defaultValue={profile?.full_name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t['settings.email']}</label>
            <input value={email} disabled className="w-full px-4 py-2.5 bg-slate-100 border border-border rounded-lg text-muted-foreground cursor-not-allowed" />
            <p className="text-xs text-muted-foreground mt-1">{t['settings.email_note']}</p>
          </div>
          <div className="flex items-center justify-between">
            <SuccessMsg state={profileState} savedLabel={t['settings.saved']} />
            <button type="submit" disabled={profilePending} className="ml-auto px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50 text-sm">
              {profilePending ? t['settings.saving'] : t['settings.save_profile']}
            </button>
          </div>
        </form>
      </div>

      {/* Company */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold">{t['settings.company']}</h2>
        </div>
        <form action={companyAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t['settings.company_name']}</label>
            <input name="company_name" defaultValue={company?.company_name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
            <input
              type="checkbox"
              name="ai_enabled"
              value="true"
              id="ai_enabled"
              defaultChecked={company?.ai_enabled ?? true}
              className="w-4 h-4 accent-primary"
            />
            <div>
              <label htmlFor="ai_enabled" className="text-sm font-medium cursor-pointer">{t['settings.ai_enabled']}</label>
              <p className="text-xs text-muted-foreground">{t['settings.ai_enabled_desc']}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <SuccessMsg state={companyState} savedLabel={t['settings.saved']} />
            <button type="submit" disabled={companyPending} className="ml-auto px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50 text-sm">
              {companyPending ? t['settings.saving'] : t['settings.save_company']}
            </button>
          </div>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold">{t['settings.change_password']}</h2>
        </div>
        <form action={pwAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t['settings.new_password']}</label>
            <input name="password" type="password" autoComplete="new-password" className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t['settings.confirm_password']}</label>
            <input name="confirm" type="password" autoComplete="new-password" className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="flex items-center justify-between">
            <SuccessMsg state={pwState} savedLabel={t['settings.saved']} />
            <button type="submit" disabled={pwPending} className="ml-auto px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50 text-sm">
              {pwPending ? t['settings.updating'] : t['settings.update_password']}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
