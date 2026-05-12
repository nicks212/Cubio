'use client';

import Link from 'next/link';
import { Box, Mail } from 'lucide-react';
import { useT } from '@/components/TranslationsProvider';

export default function VerifyEmailPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
              <Box className="w-8 h-8 text-white" />
            </div>
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t['auth.verify_title']}</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{t['auth.verify_msg']}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-sm text-muted-foreground mb-6">
            {t['auth.verify_no_email']}{' '}
            <Link href="/auth/register" className="text-primary hover:underline font-medium">
              {t['auth.verify_retry']}
            </Link>
            .
          </div>

          <Link
            href="/auth/login"
            className="block w-full py-3 text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t['auth.back_login']}
          </Link>
        </div>
      </div>
    </div>
  );
}
