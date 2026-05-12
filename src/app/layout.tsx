import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cubio – AI-Powered Business Automation',
  description: 'Multi-tenant AI business communication platform. Connect your channels and automate customer conversations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
