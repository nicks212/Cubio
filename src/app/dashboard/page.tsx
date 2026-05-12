import { createClient } from '@/lib/supabase/server';
import { Users, Home, Clock, CheckCircle2, MessageSquare, TrendingUp, Gem } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { getTranslations } from '@/lib/i18n';

export default async function DashboardPage() {
  const [t, supabaseClient] = await Promise.all([getTranslations(), createClient()]);
  const supabase = supabaseClient;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, company:companies(*)')
    .eq('id', user.id)
    .single();

  const company = profile?.company;
  const isRealEstate = company?.business_type === 'real_estate';

  // Fetch stats
  const [leadsRes, conversationsRes, apartmentsRes, productsRes] = await Promise.all([
    supabase.from('leads').select('id, status, ai_handled, created_at, name, interest').eq('company_id', company?.id ?? '').order('created_at', { ascending: false }).limit(5),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', company?.id ?? ''),
    isRealEstate ? supabase.from('apartments').select('id, status').eq('company_id', company?.id ?? '').is('deleted_at', null) : Promise.resolve({ data: [] }),
    !isRealEstate ? supabase.from('products').select('id').eq('company_id', company?.id ?? '').is('deleted_at', null) : Promise.resolve({ data: [] }),
  ]);

  const leads = leadsRes.data ?? [];
  const totalLeads = leads.length;
  const apartments = (apartmentsRes as { data: { status: string }[] | null })?.data ?? [];
  const vacant = apartments.filter((a) => a.status === 'vacant').length;
  const reserved = apartments.filter((a) => a.status === 'reserved').length;
  const sold = apartments.filter((a) => a.status === 'sold').length;
  const products = (productsRes as { data: unknown[] | null })?.data ?? [];
  const convCount = (conversationsRes as { count: number | null }).count ?? 0;

  const realEstateStats = [
    { label: t['dashboard.total_leads'], value: totalLeads.toString(), icon: Users, color: 'bg-blue-500' },
    { label: t['dashboard.vacant_units'], value: vacant.toString(), icon: Home, color: 'bg-green-500' },
    { label: t['dashboard.reserved'], value: reserved.toString(), icon: Clock, color: 'bg-amber-500' },
    { label: t['dashboard.sold'], value: sold.toString(), icon: CheckCircle2, color: 'bg-purple-500' },
  ];

  const craftStats = [
    { label: t['dashboard.total_products'], value: products.length.toString(), icon: Gem, color: 'bg-purple-500' },
    { label: t['dashboard.total_leads'], value: totalLeads.toString(), icon: Users, color: 'bg-blue-500' },
    { label: t['dashboard.ai_conversations'], value: convCount.toString(), icon: MessageSquare, color: 'bg-green-500' },
    { label: t['dashboard.conversion_rate'], value: '—', icon: TrendingUp, color: 'bg-amber-500' },
  ];

  const stats = isRealEstate ? realEstateStats : craftStats;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t['dashboard.title']}</h1>
        <p className="text-muted-foreground">{t['dashboard.subtitle']}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-1">{value}</h3>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            {t['dashboard.recent_leads']}
          </h2>
        </div>
        {leads.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">{t['dashboard.no_leads']}</p>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <div key={lead.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {(lead.name ?? 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-foreground text-sm">{lead.name ?? 'Unknown'}</h4>
                    <span className="text-xs text-muted-foreground">{formatDate(lead.created_at)}</span>
                  </div>
                  {lead.interest && <p className="text-sm text-muted-foreground mb-2">{lead.interest}</p>}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      lead.status === 'qualified' ? 'bg-green-100 text-green-700' :
                      lead.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      lead.status === 'lost' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{lead.status}</span>
                    {lead.ai_handled && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">AI</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
