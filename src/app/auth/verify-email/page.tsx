'use client';

import Link from 'next/link';
import { Box, Mail } from 'lucide-react';

export default function VerifyEmailPage() {
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
            <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              We sent a confirmation link to your email address.<br />
              Click the link to activate your account.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-sm text-muted-foreground mb-6">
            Didn&apos;t receive the email? Check your spam folder, or{' '}
            <Link href="/auth/register" className="text-primary hover:underline font-medium">
              try again with a different address
            </Link>
            .
          </div>

          <Link
            href="/auth/login"
            className="block w-full py-3 text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
