import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { DEFAULT_TRANSLATIONS, DEFAULT_TRANSLATIONS_EN } from '@/lib/i18n';
import AdminClient from './AdminClient';

// Cubio bills per Tbilisi (UTC+4, no DST) time, so a "day" means that day in Georgia —
// not the UTC day. The report window is an inclusive [from, to] range of Tbilisi calendar
// days; usage + unique users are queried once over the whole window (so a user active in
// two different months inside the range is still counted once — the Set dedupes).
const TBILISI_OFFSET_HOURS = 4;

const pad2 = (n: number) => String(n).padStart(2, '0');
const isDateStr = (s?: string | null): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonthStr = (s?: string | null): s is string => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);

function resolveDateRange(params: { from?: string | null; to?: string | null; month?: string | null }) {
  const nowTbilisi = new Date(Date.now() + TBILISI_OFFSET_HOURS * 3_600_000);
  const todayStr = `${nowTbilisi.getUTCFullYear()}-${pad2(nowTbilisi.getUTCMonth() + 1)}-${pad2(nowTbilisi.getUTCDate())}`;

  let fromDate: string;
  let toDate: string;
  if (isDateStr(params.from) || isDateStr(params.to)) {
    // Explicit range — fill a missing side from the other, defaulting to today.
    fromDate = isDateStr(params.from) ? params.from : (isDateStr(params.to) ? params.to : todayStr);
    toDate = isDateStr(params.to) ? params.to : (isDateStr(params.from) ? params.from : todayStr);
  } else if (isMonthStr(params.month)) {
    // Month quick-pick → first..last calendar day of that month.
    const [y, m] = params.month.split('-').map(Number);
    fromDate = `${params.month}-01`;
    toDate = `${params.month}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  } else {
    // Default: current Tbilisi month up to today.
    fromDate = `${nowTbilisi.getUTCFullYear()}-${pad2(nowTbilisi.getUTCMonth() + 1)}-01`;
    toDate = todayStr;
  }
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate]; // tolerate reversed input

  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  // Tbilisi-local midnight boundaries expressed as UTC instants; end is exclusive (day after `to`).
  const startIso = new Date(Date.UTC(fy, fm - 1, fd, -TBILISI_OFFSET_HOURS)).toISOString();
  const endIso = new Date(Date.UTC(ty, tm - 1, td + 1, -TBILISI_OFFSET_HOURS)).toISOString();
  return { fromDate, toDate, startIso, endIso };
}

const ADMIN_TABS = ['users', 'localizations', 'integrations', 'usage', 'conversations', 'leads', 'escalations', 'reservations', 'terms'] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

type AdminPageProps = {
  searchParams?: Promise<{ month?: string; from?: string; to?: string; tab?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: selfProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!selfProfile?.is_admin) redirect('/dashboard');

  const adminClient = createAdminClient();
  const params = searchParams ? await searchParams : {};
  const { fromDate, toDate, startIso, endIso } = resolveDateRange({
    from: params?.from ?? null,
    to: params?.to ?? null,
    month: params?.month ?? null,
  });
  const initialTab: AdminTab = ADMIN_TABS.includes(params?.tab as AdminTab) ? (params!.tab as AdminTab) : 'users';

  const [
    { data: users },
    { data: dbLocalizations },
    { data: integrations },
    { data: companies },
    { data: termsRows },
    usageRes,
    activeConversationsRes,
  ] = await Promise.all([
    adminClient.from('profiles').select('*, company:companies(company_name, business_type)').order('created_at', { ascending: false }),
    adminClient.from('localizations').select('id, keyword, localization_text, localization_text_en').order('keyword'),
    adminClient.from('integrations').select('*, company:companies(company_name)').order('created_at', { ascending: false }),
    adminClient.from('companies').select('id, company_name, business_type').order('company_name'),
    adminClient.from('terms_content').select('language, content, updated_at'),
    adminClient
      .from('ai_usage_events')
      .select('company_id, input_tokens, output_tokens, total_tokens, company:companies(company_name)')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    adminClient
      .from('conversations')
      .select('company_id, provider, provider_conversation_id, messages!inner(created_at)')
      .gte('messages.created_at', startIso)
      .lt('messages.created_at', endIso),
  ]);

  // Merge all default keys with DB overrides so every key is visible and editable
  const dbMap = new Map((dbLocalizations ?? []).map(l => [l.keyword, l]));
  const allLocalizations = Object.entries(DEFAULT_TRANSLATIONS)
    .map(([keyword, defaultText]) => {
      const db = dbMap.get(keyword);
      return {
        id: db?.id ?? null as string | null,
        keyword,
        localization_text: db?.localization_text ?? defaultText,
        localization_text_en: (db as { localization_text_en?: string | null } | undefined)?.localization_text_en ?? DEFAULT_TRANSLATIONS_EN[keyword] ?? '',
      };
    })
    .sort((a, b) => a.keyword.localeCompare(b.keyword));

  const usageTrackingReady = !usageRes.error;
  const companyMap = new Map((companies ?? []).map(c => [c.id, c.company_name]));
  const usageByCompany = new Map<string, { companyId: string; companyName: string; inputTokens: number; outputTokens: number; totalTokens: number; uniqueUsersServed: number }>();

  for (const company of companies ?? []) {
    usageByCompany.set(company.id, {
      companyId: company.id,
      companyName: company.company_name,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      uniqueUsersServed: 0,
    });
  }

  for (const row of ((usageRes.data ?? []) as Array<{
    company_id: string;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    company?: { company_name?: string | null } | { company_name?: string | null }[] | null;
  }>)) {
    const companyName = Array.isArray(row.company)
      ? (row.company[0]?.company_name ?? companyMap.get(row.company_id) ?? 'Unknown company')
      : (row.company?.company_name ?? companyMap.get(row.company_id) ?? 'Unknown company');
    const current = usageByCompany.get(row.company_id) ?? {
      companyId: row.company_id,
      companyName,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      uniqueUsersServed: 0,
    };
    current.inputTokens += row.input_tokens ?? 0;
    current.outputTokens += row.output_tokens ?? 0;
    current.totalTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    usageByCompany.set(row.company_id, current);
  }

  const activeUserSets = new Map<string, Set<string>>();
  for (const row of ((activeConversationsRes.data ?? []) as Array<{
    company_id: string;
    provider: string;
    provider_conversation_id: string;
  }>)) {
    const key = `${row.provider}:${row.provider_conversation_id}`;
    const set = activeUserSets.get(row.company_id) ?? new Set<string>();
    set.add(key);
    activeUserSets.set(row.company_id, set);
  }

  for (const [companyId, usersSet] of activeUserSets) {
    const current = usageByCompany.get(companyId) ?? {
      companyId,
      companyName: companyMap.get(companyId) ?? 'Unknown company',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      uniqueUsersServed: 0,
    };
    current.uniqueUsersServed = usersSet.size;
    usageByCompany.set(companyId, current);
  }

  const usageReport = [...usageByCompany.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.companyName.localeCompare(b.companyName));

  return (
    <AdminClient
      users={users ?? []}
      localizations={allLocalizations}
      integrations={integrations ?? []}
      companies={companies ?? []}
      termsContent={termsRows ?? []}
      usageReport={usageReport}
      fromDate={fromDate}
      toDate={toDate}
      usageTrackingReady={usageTrackingReady}
      initialTab={initialTab}
    />
  );
}
