import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAppStore } from '../lib/store';
import { authFetch } from '../lib/api';
import type { ApiResponse, ApiKeyData, PortalUsage } from '../lib/types';
import { StatCard, SectionTitle, LoadingSpinner, EmptyState } from '../components/Layout';

type Tab = 'overview' | 'keys';

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

const CHART_PALETTE = ['var(--accent)', 'var(--accent-violet)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--danger)'];
const dayColor = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length];

export default function B2BPortalPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <>
      <SectionTitle eyebrow="Clients" title="B2B Portal" description="Monitor your API usage, manage keys, and track performance." />

      <div className="mb-6 flex gap-2">
        {(['overview', 'keys'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-2 rounded-[7px] px-4 py-2 text-sm font-medium border transition-colors duration-200 ${tab === t ? 'tab-active border-transparent' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:border-[var(--border-hover)]'}`}>
            <span className="text-xs">{t === 'overview' ? '◧' : '⬢'}</span>
            {t === 'overview' ? 'Usage Overview' : 'API Keys'}
          </button>
        ))}
      </div>

      <div className="animate-fade-in">
        {tab === 'overview' && <UsageOverview />}
        {tab === 'keys' && <KeyManagement />}
      </div>
    </>
  );
}

function UsageOverview() {
  const { token } = useAppStore();
  const [range, setRange] = useState<'7' | '30'>('30');
  const { data, isLoading } = useQuery({
    queryKey: ['portal-usage'],
    queryFn: () => authFetch<PortalUsage>('/portal/usage', token!)
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const { planType, status, dailyLimit, limitSource, autoSuspendEnabled, todayRequests, monthRequests, avgResponseTime, successRate, usageChart, chartEndpoints, alerts } = data.data;
  const pctUsed = dailyLimit > 0 ? Math.round((todayRequests / dailyLimit) * 100) : 0;
  const limitNote = limitSource === 'temporary' ? ` · temporary increase${data.data.limitExpiresAt ? ` until ${new Date(data.data.limitExpiresAt!).toLocaleDateString()}` : ''}` : limitSource === 'override' ? ' · custom limit' : '';
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (range === '7' ? 6 : 29));
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const chartData = usageChart.filter(r => r.date >= cutoffISO);

  return (
    <div>
      {status === 'SUSPENDED' && (
        <div className="mb-4 glass-card border-rose-500/20 p-5 animate-fade-in">
          <p className="text-sm font-semibold text-rose-300">Account suspended</p>
          <p className="mt-1 text-xs text-rose-300/70">Your account has been suspended after exceeding the permitted usage. Contact support to restore access.</p>
        </div>
      )}
      {(alerts ?? []).length > 0 && (
        <div className="mb-4 space-y-2">
          {(alerts ?? []).map(a => (
            <div key={a.id} className={`glass-card p-4 animate-fade-in ${a.kind === 'AUTO_SUSPENDED' || a.kind === 'LIMIT_EXCEEDED' ? 'border-rose-500/20' : 'border-amber-500/20'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${a.kind === 'AUTO_SUSPENDED' || a.kind === 'LIMIT_EXCEEDED' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>{a.kind === 'AUTO_SUSPENDED' || a.kind === 'LIMIT_EXCEEDED' ? '⛔' : '⚠️'}</div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{a.kind === 'AUTO_SUSPENDED' ? 'Account auto-suspended' : a.kind === 'LIMIT_EXCEEDED' ? 'Daily limit exceeded' : `Daily limit ${a.threshold}% reached`}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{a.used.toLocaleString()} of {a.limit.toLocaleString()} requests used · {new Date(a.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 stagger-children">
        <StatCard label="Today's Requests" value={todayRequests.toLocaleString()} hint={`${pctUsed}% of ${dailyLimit.toLocaleString()} limit`} accent="cyan" />
        <StatCard label="This Month" value={monthRequests.toLocaleString()} hint={`Plan: ${planType}`} accent="violet" />
        <StatCard label="Avg Response" value={`${avgResponseTime}ms`} hint="Last 24 hours" accent="emerald" />
        <StatCard label="Success Rate" value={`${successRate}%`} hint="2xx responses" accent="amber" />
      </div>

      <div className="editorial-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold text-[var(--text-primary)]">Usage Over Last {range} Days</h3>
          <div className="flex gap-1 rounded-md border border-[var(--border)] p-0.5">
            {(['7', '30'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)} className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${range === r ? 'bg-[var(--accent)] text-[var(--background)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                {r} Days
              </button>
            ))}
          </div>
        </div>
        {(chartEndpoints ?? []).length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {(chartEndpoints ?? []).map((e, i) => (
              <span key={e} className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: dayColor(i) }} />
                <span className="font-mono">{e}</span>
              </span>
            ))}
          </div>
        )}
        <div className="h-px w-full bg-[var(--border)] mb-4" />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' } as any} axisLine={false} tickLine={false} width={40} />
            <Tooltip {...chartTooltipStyle} />
            {(chartEndpoints ?? []).map((e, i) => (
              <Line key={e} type="monotone" dataKey={e} name={e} stroke={dayColor(i)} strokeWidth={1.8} dot={false} activeDot={{ r: 4, fill: dayColor(i), stroke: 'var(--card)', strokeWidth: 2 } as any} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="editorial-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold text-[var(--text-primary)]">Daily Limit Usage</h3>
          <span style={{ fontFamily: 'var(--font-mono)' }} className={`text-xs font-semibold tabular-nums ${pctUsed > 90 ? 'text-[var(--danger)]' : pctUsed > 70 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-emerald)]'}`}>{pctUsed}%</span>
        </div>
        <div className="h-px w-full bg-[var(--border)] mb-4" />
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--background-secondary)] border border-[var(--border)]">
          <div className={`h-full rounded-full transition-all duration-500 ${pctUsed > 90 ? 'bg-[var(--danger)]' : pctUsed > 70 ? 'bg-[var(--accent-amber)]' : 'bg-[var(--accent-emerald)]'}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">{todayRequests.toLocaleString()} / {dailyLimit.toLocaleString()} requests used today{limitNote}{autoSuspendEnabled ? ' · auto-suspend enabled' : ''}</p>
      </div>
    </div>
  );
}

function KeyManagement() {
  const { token } = useAppStore();
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState('');
  const [newKeyData, setNewKeyData] = useState<{ key: string; secret: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-api-keys'],
    queryFn: () => authFetch<ApiResponse<ApiKeyData[]>>('/portal/api-keys', token!)
  });

  const createMut = useMutation({
    mutationFn: (label: string) => authFetch<ApiResponse<{ id: string; key: string; secret: string; label: string; message: string }>>('/portal/api-keys', token!, { method: 'POST', body: JSON.stringify({ label }) }),
    onSuccess: (res) => { setNewKeyData({ key: res.data.key, secret: res.data.secret }); setNewLabel(''); qc.invalidateQueries({ queryKey: ['portal-api-keys'] }); }
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => authFetch(`/portal/api-keys/${id}`, token!, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-api-keys'] })
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) => authFetch<ApiResponse<{ secret: string; message: string }>>(`/portal/api-keys/${id}/rotate-secret`, token!, { method: 'POST' }),
    onSuccess: (res) => { alert(`New secret: ${res.data.secret}\n${res.data.message}`); }
  });

  const keys = data?.data ?? [];

  return (
    <div>
      {newKeyData && (
        <div className="mb-6 glass-card border-amber-500/20 p-6 animate-fade-in">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">⚠️</div>
            <div>
              <p className="text-sm font-semibold text-amber-300">Store these credentials securely</p>
              <p className="text-xs text-amber-400/60 mt-1">The secret will not be shown again after you leave this page.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)]">
              <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">API Key</span>
              <code className="flex-1 text-sm text-[var(--accent)] font-mono break-all">{newKeyData.key}</code>
              <button onClick={() => { navigator.clipboard.writeText(newKeyData.key); setCopiedKey(true); setTimeout(() => setCopiedKey(false), 2000); }} className="btn-ghost text-xs py-1 px-2.5 shrink-0">{copiedKey ? '✓ Copied' : 'Copy'}</button>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)]">
              <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">Secret</span>
              <code className="flex-1 text-sm text-emerald-400 font-mono break-all">{newKeyData.secret}</code>
              <button onClick={() => { navigator.clipboard.writeText(newKeyData.secret); setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000); }} className="btn-ghost text-xs py-1 px-2.5 shrink-0">{copiedSecret ? '✓ Copied' : 'Copy'}</button>
            </div>
          </div>
          <button onClick={() => setNewKeyData(null)} className="mt-4 btn-ghost text-xs">Dismiss</button>
        </div>
      )}

      <div className="editorial-card p-5 mb-4">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3">Create New Key</p>
        <div className="flex gap-3">
          <input placeholder="Key name (e.g. Production Server)" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="input-field flex-1" />
          <button onClick={() => { if (newLabel.trim()) createMut.mutate(newLabel.trim()); }} disabled={!newLabel.trim() || createMut.isPending} className="btn-primary shrink-0 text-sm">
            {createMut.isPending ? 'Creating…' : 'Generate Key'}
          </button>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : keys.length === 0 ? <EmptyState message="No API keys yet. Create one above." /> : (
        <div className="editorial-card p-4">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th>Last Used</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id}>
                    <td className="font-mono text-xs text-[var(--accent)]">{k.keyMasked}</td>
                    <td className="font-medium text-[var(--text-primary)]">{k.label}</td>
                    <td><span className={`badge ${k.isActive ? 'badge-emerald' : 'badge-rose'}`}>{k.isActive ? 'Active' : 'Revoked'}</span></td>
                    <td className="tabular-nums text-[var(--text-muted)]">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                    <td className="text-[var(--text-muted)]">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-1.5">
                        {k.isActive && <button onClick={() => rotateMut.mutate(k.id)} className="badge badge-amber cursor-pointer hover:opacity-80 transition">Rotate</button>}
                        {k.isActive && <button onClick={() => { if (confirm('Revoke this key?')) revokeMut.mutate(k.id); }} className="badge badge-rose cursor-pointer hover:opacity-80 transition">Revoke</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
