'use client';

import { useState, type ReactNode } from 'react';
import { Search, ChevronRight, ChevronLeft, Building2 } from 'lucide-react';
import { useT } from '@/components/TranslationsProvider';

export interface BrowserCompany { id: string; company_name: string }

interface Props {
  companies: BrowserCompany[];
  title: string;
  subtitle: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Rendered (with the selected company) once a company is picked. */
  children: (company: BrowserCompany) => ReactNode;
}

/**
 * Shared admin "pick a company, then monitor it" chrome — the same pattern the
 * Conversations tab uses. The company list is already pre-filtered by the caller
 * to the business types the section applies to (e.g. reservations → salons only).
 */
export default function AdminCompanyBrowser({ companies, title, subtitle, searchPlaceholder, emptyText, children }: Props) {
  const t = useT();
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<BrowserCompany | null>(null);

  const filteredCompanies = companies.filter(c =>
    !companySearch.trim() || c.company_name.toLowerCase().includes(companySearch.toLowerCase()),
  );

  // ── Company picker ───────────────────────────────────────────────
  if (!selectedCompany) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-200">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
            placeholder={searchPlaceholder ?? t['admin.conv_search_companies'] ?? 'Search companies...'}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {filteredCompanies.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{emptyText ?? t['admin.conv_no_companies'] ?? 'No companies found'}</div>
          ) : filteredCompanies.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCompany(c)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-slate-500" />
              </div>
              <span className="flex-1 font-medium text-sm">{c.company_name}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Selected-company view ────────────────────────────────────────
  return (
    <div>
      <button
        onClick={() => setSelectedCompany(null)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        {t['admin.conv_back_to_companies'] ?? 'All companies'}
      </button>

      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{selectedCompany.company_name}</h2>
      </div>

      {/* key forces the panel to reload when the company changes */}
      <div key={selectedCompany.id}>{children(selectedCompany)}</div>
    </div>
  );
}
