'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Box, Lock, CheckCircle2 } from 'lucide-react';
import { updatePassword } from '../actions';
import { useT } from '@/components/TranslationsProvider';

export default function ResetPasswordPage() {
  const t = useT();
  const [state, action, pending] = useActionState(updatePassword, null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
              <Box className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t['auth.reset_title']}</h1>
            <p className="text-muted-foreground mt-2 text-sm">{t['auth.reset_subtitle']}</p>
          </div>

          {state?.success ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-lg">{t['auth.password_updated_title']}</p>
                <p className="text-muted-foreground text-sm mt-1">{t['auth.password_updated_msg']}</p>
              </div>
              <Link
                href="/auth/login"
                className="mt-2 w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium text-center text-sm"
              >
                {t['auth.sign_in_new_password']}
              </Link>
            </div>
          ) : (
            <>
              {state?.error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {state.error}
                </div>
              )}

              <form action={action} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm mb-2 text-foreground font-medium">
                    {t['auth.new_password']}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="password"
                      name="password"
                      type="password"
                      className="w-full pl-11 pr-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="••••••••"
                      minLength={8}
                      required
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t['auth.min_8']}</p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm mb-2 text-foreground font-medium">
                    {t['auth.confirm_new_password']}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      className="w-full pl-11 pr-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="••••••••"
                      minLength={8}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending ? t['auth.updating'] : t['auth.update_password_btn']}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {t['auth.back_login']}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
