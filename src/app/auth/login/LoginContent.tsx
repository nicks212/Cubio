'use client';

import { Suspense, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Box, Mail, Lock, ArrowLeft } from 'lucide-react';
import { login, resendConfirmationEmail } from '../actions';
import { useT } from '@/components/TranslationsProvider';

const URL_ERRORS: Record<string, string> = {
  email_link_expired: 'email_link_expired',
  email_confirmation_failed: 'email_confirmation_failed',
};

function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState(login, null);
  const [resendState, resendAction, resendPending] = useActionState(resendConfirmationEmail, null);
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const urlErrorMessage = urlError ? (t[`url_error.${urlError}`] ?? t['url_error.default'] ?? 'Something went wrong. Please try again.') : null;

  const isUnconfirmed = state?.code === 'email_not_confirmed';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t['auth.back_home']}
        </Link>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
              <Box className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t['auth.sign_in_title']}</h1>
            <p className="text-muted-foreground mt-2">{t['auth.sign_in_subtitle']}</p>
          </div>

          {isUnconfirmed ? (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <p className="font-medium mb-1">{t['auth.unconfirmed_title']}</p>
              <p className="mb-3">{t['auth.unconfirmed_msg']}</p>
              {resendState?.success ? (
                <p className="text-green-700 font-medium">{t['auth.resent_ok']}</p>
              ) : (
                <form action={resendAction}>
                  <input type="hidden" name="email" value={state.email ?? ''} />
                  <button
                    type="submit"
                    disabled={resendPending}
                    className="text-primary underline hover:no-underline disabled:opacity-50 font-medium"
                  >
                    {resendPending ? t['auth.resending'] : t['auth.resend_link']}
                  </button>
                </form>
              )}
              {resendState?.error && (
                <p className="mt-2 text-red-600">{resendState.error}</p>
              )}
            </div>
          ) : (urlErrorMessage || state?.error) ? (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {urlErrorMessage ?? state?.error}
            </div>
          ) : null}

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

            <div>
              <label htmlFor="password" className="block text-sm mb-2 text-foreground font-medium">
                {t['auth.password']}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="w-full pl-11 pr-4 py-3 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm text-muted-foreground">{t['auth.remember_me']}</span>
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
                {t['auth.forgot_password']}
              </Link>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {pending ? t['auth.signing_in'] : t['auth.sign_in_btn']}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t['auth.no_account']}{' '}
            <Link href="/auth/register" className="text-primary hover:underline font-medium">
              {t['auth.create_one']}
            </Link>
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center transform rotate-3">
            <Box className="w-10 h-10 text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginContent() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
