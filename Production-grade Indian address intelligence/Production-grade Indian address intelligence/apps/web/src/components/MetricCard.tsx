import type { ReactNode } from 'react';

const topBorder: Record<string, string> = {
  cyan: 'border-t-[var(--accent)]',
  violet: 'border-t-[var(--accent-violet)]',
  emerald: 'border-t-[var(--accent-emerald)]',
  amber: 'border-t-[var(--accent-amber)]',
  rose: 'border-t-[var(--danger)]'
};

export function DeltaBadge({ pct, className = '' }: { pct: number; className?: string }) {
  const rounded = Math.round(pct * 10) / 10;
  const up = rounded > 0;
  const flat = rounded === 0;
  const text = flat ? '0%' : `${up ? '+' : ''}${rounded}%`;
  return (
    <span
      className={`badge text-[10px] tabular-nums ${flat ? 'badge-slate' : up ? 'badge-emerald' : 'badge-rose'} ${className}`}
      title="Change vs previous period"
    >
      {flat ? '–' : up ? '▲' : '▼'}&nbsp;{text}
    </span>
  );
}

export function SlaPill({ met, targetMs }: { met: boolean; targetMs: number }) {
  return (
    <span
      className={`badge text-[10px] ${met ? 'badge-emerald' : 'badge-rose'}`}
      title={`SLA target: average response time ≤ ${targetMs}ms over 24 hours`}
    >
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${met ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--danger)]'}`} />
      {met ? 'SLA met' : 'SLA breach'}
    </span>
  );
}

export function HourlySparkline({ data, colorVar }: { data: Array<{ hour: string; requests: number }>; colorVar: string }) {
  if (data.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)]">No requests yet today</p>;
  }
  const max = Math.max(...data.map(d => d.requests), 1);
  const peak = data.reduce((best, d) => (d.requests > best.requests ? d : best), data[0]);
  const last = data[data.length - 1];
  const compact = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div>
      <div className="flex h-9 items-end gap-[2px]">
        {data.map(d => {
          const h = d.requests === 0 ? 3 : Math.max(5, Math.round((d.requests / max) * 36));
          return (
            <div
              key={d.hour}
              title={`${d.hour}:00 UTC — ${d.requests.toLocaleString()} requests`}
              className="flex-1 min-w-[3px] rounded-t-[2px]"
              style={{ height: `${h}px`, background: `var(${colorVar})`, opacity: d.requests === 0 ? 0.22 : 0.55 + (d.requests / max) * 0.45 }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
        <span className="text-[9px] tracking-[0.04em] text-[var(--text-muted)]">00:00</span>
        <span className="text-[9px] tabular-nums tracking-[0.04em] text-[var(--text-secondary)]">
          peak {peak.hour}:00 · {compact(peak.requests)}
        </span>
        <span className="text-[9px] tabular-nums tracking-[0.04em] text-[var(--text-muted)]">{last.hour}:00</span>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  accent = 'cyan',
  badge,
  footer
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={`editorial-card border-t-2 ${topBorder[accent] ?? topBorder.cyan} p-5 flex flex-col animate-fade-in`}>
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
        {badge}
      </div>
      <p style={{ fontFamily: 'var(--font-display)' }} className="mt-3 text-[28px] font-bold leading-none tracking-[-0.02em] text-[var(--text-primary)] tabular-nums">{value}</p>
      <div className="mt-3 h-px w-8 bg-[var(--border)]" />
      {hint && <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed">{hint}</p>}
      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </div>
  );
}
