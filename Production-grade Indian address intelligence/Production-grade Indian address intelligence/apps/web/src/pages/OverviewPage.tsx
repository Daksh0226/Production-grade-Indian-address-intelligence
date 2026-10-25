import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, Legend } from 'recharts';
import { useAppStore } from '../lib/store';
import { authFetch } from '../lib/api';
import type { DashboardData } from '../lib/types';
import { SectionTitle, LoadingSpinner, ErrorMessage } from '../components/Layout';
import { MetricCard, DeltaBadge, SlaPill, HourlySparkline } from '../components/MetricCard';

const pieColors = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24'];

function aggregateStacked(raw: Array<{ endpoint: string; requests: number; statusCode: number }>) {
  const map = new Map<string, { endpoint: string; ok: number; clientErr: number; serverErr: number }>();
  for (const r of raw) {
    const e = map.get(r.endpoint) ?? { endpoint: r.endpoint, ok: 0, clientErr: 0, serverErr: 0 };
    if (r.statusCode >= 200 && r.statusCode < 300) e.ok += r.requests;
    else if (r.statusCode >= 400 && r.statusCode < 500) e.clientErr += r.requests;
    else if (r.statusCode >= 500) e.serverErr += r.requests;
    map.set(r.endpoint, e);
  }
  return Array.from(map.values());
}

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: 'var(--tooltip-shadow)',
    color: 'var(--text-primary)',
  },
  labelStyle: { color: 'var(--text-primary)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' } as const,
  itemStyle: { color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-body)' } as const,
} as const;

function ChartHeader({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h3>
      <span className="badge badge-slate text-[10px]">{badge}</span>
    </div>
  );
}

export default function OverviewPage() {
  const { token } = useAppStore();
  const { data, isLoading, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => authFetch<DashboardData>('/admin/dashboard', token!),
    enabled: !!token,
    // Spec 8.1 — real-time charts (requests, p95/p99, heat map) auto-refresh every 30s
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 15_000
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load dashboard. You may need admin access." />;
  if (!data) return null;

  const { metrics, charts } = data.data;
  const stackedData = aggregateStacked(charts.stacked);

  const activeToday = metrics.activeUsers ?? 0;
  const activeYesterday = metrics.activeUsersYesterday ?? 0;
  const activePct = activeYesterday > 0 ? ((activeToday - activeYesterday) / activeYesterday) * 100 : activeToday > 0 ? 100 : 0;
  const slaTargetMs = metrics.slaTargetMs ?? 500;
  const revenue = metrics.revenue;
  const formatInr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return (
    <>
      <SectionTitle eyebrow="Analytics" title="Platform Overview" description="Key metrics and usage analytics across the Village API platform." />

      <div className="mb-5 flex items-center gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: isFetching ? 'var(--accent-amber)' : 'var(--accent-emerald)', boxShadow: isFetching ? '0 0 0 3px rgba(184,134,11,0.15)' : '0 0 0 3px rgba(14,124,91,0.15)' }}
        />
        <span className="text-[var(--text-secondary)]">{isFetching ? 'Refreshing…' : `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`}</span>
        <span className="text-[var(--text-muted)]">· auto-refresh 30s · real-time charts</span>
      </div>

      <div className={`mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${revenue != null ? '2xl:grid-cols-5' : ''}`}>
        <MetricCard
          label="Total Villages"
          value={metrics.totalVillages.toLocaleString()}
          hint={`${(metrics.villagesAddedWeek ?? 0).toLocaleString()} added in the last 7 days`}
          accent="cyan"
          badge={<DeltaBadge pct={metrics.villagesChangePct ?? 0} />}
        />
        <MetricCard
          label="Active Users"
          value={activeToday.toLocaleString()}
          hint={`vs ${activeYesterday.toLocaleString()} yesterday · distinct callers today`}
          accent="violet"
          badge={<DeltaBadge pct={activePct} />}
        />
        <MetricCard
          label="Today's Requests"
          value={metrics.todayRequests.toLocaleString()}
          hint="Hourly breakdown since 00:00 UTC"
          accent="emerald"
          footer={<HourlySparkline data={metrics.todayHourly ?? []} colorVar="--accent-emerald" />}
        />
        <MetricCard
          label="Avg Response"
          value={`${metrics.averageResponseTime}ms`}
          hint={`24h average · target ≤ ${slaTargetMs}ms`}
          accent="amber"
          badge={<SlaPill met={metrics.slaMet ?? true} targetMs={slaTargetMs} />}
        />
        {revenue != null && (
          <MetricCard
            label="Total Revenue"
            value={formatInr(revenue)}
            hint="Gross collected · payment integration"
            accent="rose"
            badge={<span className="badge badge-slate text-[10px]">INR</span>}
          />
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top States — editorial, ensure all state names visible */}
        <div className="editorial-card p-5">
          <ChartHeader title="Top States by Village Count" badge="Daily" />
          <div className="h-px w-full bg-[var(--border)] mb-4" />
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={charts.topStates} margin={{ left: -8, right: 8, top: 8, bottom: 72 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={72}
              />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} width={40} />
              <Tooltip {...chartTooltipStyle} cursor={{ fill: 'var(--border)' } as any} />
              <Bar dataKey="villages" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {charts.topStates.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? 'var(--accent)' : 'var(--accent-violet)'} fillOpacity={0.9} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="editorial-card p-5">
          <ChartHeader title="Requests — Last 30 Days" badge="Real-time" />
          <div className="h-px w-full bg-[var(--border)] mb-4" />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts.line} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} width={40} />
              <Tooltip {...chartTooltipStyle} />
              <Line type="monotone" dataKey="requests" stroke="var(--accent-emerald)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--accent-emerald)', stroke: 'var(--card)', strokeWidth: 2 } as any} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="editorial-card p-5">
          <ChartHeader title="Users by Plan" badge="Hourly" />
          <div className="h-px w-full bg-[var(--border)] mb-4" />
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={3} stroke="var(--card)" strokeWidth={2} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {charts.pie.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} fillOpacity={0.9} />)}
              </Pie>
              <Tooltip {...chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="editorial-card p-5">
          <ChartHeader title="Response Time Trends (p95 / p99)" badge="Real-time" />
          <div className="h-px w-full bg-[var(--border)] mb-4" />
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={charts.area} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} width={36} />
              <Tooltip {...chartTooltipStyle} />
              <Area type="monotone" dataKey="p95" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={1.7} />
              <Area type="monotone" dataKey="p99" stroke="var(--accent-amber)" fill="rgba(184,134,11,0.07)" strokeWidth={1.7} />
              <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' } as any} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-6 editorial-card p-5">
        <ChartHeader title="Requests by Endpoint" badge="Daily" />
        <div className="h-px w-full bg-[var(--border)] mb-4" />
        {stackedData.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No request data yet — traffic appears here once clients start calling the API.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stackedData} margin={{ left: -8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="endpoint" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} width={36} />
              <Tooltip {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' } as any} />
              <Bar dataKey="ok" name="2xx" stackId="a" fill="var(--accent-emerald)" fillOpacity={0.9} radius={[0,0,0,0]} />
              <Bar dataKey="clientErr" name="4xx" stackId="a" fill="var(--accent-amber)" fillOpacity={0.9} />
              <Bar dataKey="serverErr" name="5xx" stackId="a" fill="var(--danger)" fillOpacity={0.9} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Heat Map — Usage by hour of day (spec 8.1) */}
      <div className="mb-6 editorial-card p-5">
        <ChartHeader title="Usage by Hour of Day" badge="Real-time" />
        <div className="h-px w-full bg-[var(--border)] mb-4" />
        {charts.heatmap.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No hourly data yet</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.heatmap} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} width={36} />
                <Tooltip {...chartTooltipStyle} cursor={{ fill: 'var(--border)' } as any} />
                <Bar dataKey="requests" name="Requests" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {charts.heatmap.map((_, i) => {
                    const v = charts.heatmap[i].requests;
                    const max = Math.max(...charts.heatmap.map(h => h.requests), 1);
                    const intensity = v / max;
                    // heat intensity: emerald low -> amber mid -> accent high
                    const color = intensity > 0.66 ? 'var(--accent)' : intensity > 0.33 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
                    return <Cell key={i} fill={color} fillOpacity={0.85 + intensity * 0.15} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Grid heat tiles */}
            <div className="mt-4 grid grid-cols-12 gap-1.5 sm:grid-cols-24">
              {Array.from({ length: 24 }, (_, h) => {
                const hourStr = String(h).padStart(2, '0');
                const entry = charts.heatmap.find(x => x.hour === hourStr);
                const v = entry?.requests ?? 0;
                const max = Math.max(...charts.heatmap.map(x => x.requests), 1);
                const intensity = v / max;
                const bg = v === 0 ? 'var(--background-secondary)' : intensity > 0.66 ? 'var(--accent)' : intensity > 0.33 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
                const opacity = v === 0 ? 1 : 0.55 + intensity * 0.45;
                return (
                  <div key={hourStr} className="flex flex-col items-center gap-1">
                    <div className="w-full h-7 rounded-[5px] border border-[var(--border)] flex items-center justify-center text-[10px] font-mono font-semibold" style={{ background: bg, opacity, color: v === 0 ? 'var(--text-muted)' : 'white' }} title={`${hourStr}:00 — ${v} requests`}>
                      {v}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[9px] text-[var(--text-muted)]">{hourStr}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Darker / more saturated = higher traffic. Total {charts.heatmap.reduce((s, r) => s + r.requests, 0).toLocaleString()} requests in last 24h.</p>
          </>
        )}
      </div>

      <div className="editorial-card p-5">
        <ChartHeader title="Recent Users" badge={`${data.data.users.length} users`} />
        <div className="h-px w-full bg-[var(--border)] mb-4" />
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Business</th>
                <th>Plan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.data.users.map(u => (
                <tr key={u.id}>
                  <td className="font-medium text-[var(--text-primary)]">{u.email}</td>
                  <td>{u.businessName ?? '—'}</td>
                  <td><span className={`badge ${u.planType === 'UNLIMITED' ? 'badge-violet' : u.planType === 'PRO' ? 'badge-cyan' : u.planType === 'PREMIUM' ? 'badge-emerald' : 'badge-slate'}`}>{u.planType}</span></td>
                  <td><span className={`badge ${u.status === 'ACTIVE' ? 'badge-emerald' : u.status === 'SUSPENDED' ? 'badge-rose' : 'badge-amber'}`}>{u.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
