'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Box, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '../actions';
import { useT } from '@/components/TranslationsProvider';

export default function ForgotPasswordPage() {
  const t = useT();
  const [state, action, pending] = useActionState(resetPassword, null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          href="/auth/login"
          className="mb-6 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t['auth.back_login']}
        </Link>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
              <Box className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t['auth.forgot_title']}</h1>
            <p className="text-muted-foreground mt-2 text-center">{t['auth.forgot_subtitle']}</p>
          </div>

          {state?.success ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-center text-foreground font-medium">{t['auth.reset_check_email']}</p>
              <Link href="/auth/login" className="text-primary hover:underline text-sm">
                {t['auth.back_login']}
              </Link>
            </div>
          ) : (
            <>
              {state?.error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {state.error}
                </div>
              )}

              <form action={action} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm mb-2 text-foreground font-medium">
                    {t['auth.email']}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className="w-full pl-11 pr-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder={t['auth.email_placeholder']}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {pending ? t['auth.sending'] : t['auth.send_reset']}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
