import Link from 'next/link';
import { Box, CheckCircle } from 'lucide-react';

export default function EmailConfirmedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
              <Box className="w-8 h-8 text-white" />
            </div>
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Email confirmed!</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Your email address has been verified successfully.<br />
              Let&apos;s finish setting up your account.
            </p>
          </div>

          <Link
            href="/onboarding"
            className="block w-full py-3 px-4 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors text-center"
          >
            Continue to setup
          </Link>
        </div>
      </div>
    </div>
  );
}
