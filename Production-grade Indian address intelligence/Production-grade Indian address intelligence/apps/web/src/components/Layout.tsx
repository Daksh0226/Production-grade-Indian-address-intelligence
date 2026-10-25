import { NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import type { ReactNode } from 'react';

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.6v2M12 19.4v2M4.9 4.9l1.4 1.4M18.7 18.7l1.4 1.4M2.6 12h2M19.4 12h2M4.9 19.1l1.4-1.4M18.7 5.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function ThemeToggleButton({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={`theme-toggle shrink-0 ${className}`}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export const navItems = [
  { path: '/', label: 'Overview', icon: '◧', eyebrow: 'Analytics' },
  { path: '/admin', label: 'Admin Panel', icon: '⬡', eyebrow: 'Operations' },
  { path: '/portal', label: 'B2B Portal', icon: '⬢', eyebrow: 'Clients' },
  { path: '/docs', label: 'API Docs', icon: '≡', eyebrow: 'Developers' },
  { path: '/demo', label: 'Demo Client', icon: '◇', eyebrow: 'Sales' },
  { path: '/pricing', label: 'Pricing', icon: '◎', eyebrow: 'Revenue' }
];

export function StatCard({ label, value, hint, accent = 'cyan' }: { label: string; value: string | number; hint: string; accent?: string }) {
  const topBorder: Record<string, string> = {
    cyan: 'border-t-[var(--accent)]',
    violet: 'border-t-[var(--accent-violet)]',
    emerald: 'border-t-[var(--accent-emerald)]',
    amber: 'border-t-[var(--accent-amber)]'
  };
  return (
    <div className={`editorial-card border-t-2 ${topBorder[accent] ?? topBorder.cyan} p-5 animate-fade-in`}>
      <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
      <p style={{ fontFamily: 'var(--font-display)' }} className="mt-3 text-[30px] font-bold leading-none tracking-[-0.02em] text-[var(--text-primary)]">{value}</p>
      <div className="mt-3 h-px w-8 bg-[var(--border)]" />
      <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed">{hint}</p>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-7 animate-fade-in">
      <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{eyebrow}</p>
      <div className="mt-2 h-px w-full max-w-[640px] bg-[var(--border)]" />
      <h2 style={{ fontFamily: 'var(--font-display)' }} className="mt-4 text-[30px] sm:text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
      <p className="mt-3 max-w-[640px] text-[14px] leading-6 text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="col-span-12 lg:col-span-2 lg:min-h-[calc(100vh-2rem)] bg-[var(--card)] border border-[var(--border)] rounded-[10px] p-4 lg:p-4 flex flex-col gap-5 lg:sticky lg:top-4 h-fit">
      {/* Brand — editorial */}
      <div className="px-1 pt-1 pb-4 border-b border-[var(--border)]">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Village API</p>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="mt-2 text-[18px] font-bold leading-tight tracking-[-0.015em] text-[var(--text-primary)]">Geo SaaS Platform</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">Production-grade village intelligence for Indian address flows.</p>
      </div>

      <nav className="space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-[10px] rounded-[7px] border text-left transition-colors duration-200 ${
                isActive
                  ? 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border)]'
              }`
            }
          >
            <span className="text-[11px] w-5 text-center shrink-0 font-mono opacity-70">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium leading-none tracking-[-0.01em]" style={{ fontFamily: 'var(--font-body)' }}>{item.label}</p>
              <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.08em] opacity-60 mt-[3px]">{item.eyebrow}</p>
            </div>
            {/* active indicator */}
            <span className="ml-auto hidden group-[.active]:block w-1 h-4 rounded-full bg-[var(--accent)] opacity-0 group-[.active]:opacity-100" />
          </NavLink>
        ))}
      </nav>

      <div className="hidden lg:block mt-auto pt-3 border-t border-[var(--border)]">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">© 2026 Village API — All systems operational</p>
      </div>
    </aside>
  );
}

export function HeaderBar() {
  const { user, logout } = useAppStore();
  const location = useLocation();
  const current = navItems.find(n => location.pathname === n.path || (n.path !== '/' && location.pathname.startsWith(n.path))) ?? navItems[0];

  return (
    <div className="mb-6 bg-[var(--card)] border border-[var(--border)] rounded-[10px] px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between animate-fade-in">
      <div className="min-w-0">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{current.eyebrow}</p>
        <div className="mt-1.5 h-px w-9 bg-[var(--border)] hidden sm:block" />
        <h2 style={{ fontFamily: 'var(--font-display)' }} className="mt-2 text-[22px] font-bold tracking-[-0.015em] leading-none text-[var(--text-primary)] truncate">{current.label}</h2>
      </div>
      <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
        {user && (
          <>
            <ThemeToggleButton />
            <div className="flex items-center gap-2.5 rounded-[7px] border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-[7px]">
              <div className="w-7 h-7 rounded-[6px] bg-[var(--accent)] flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                {(user.email ?? '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold leading-none text-[var(--text-primary)] truncate max-w-[160px]">{user.businessName ?? user.email}</p>
                <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.07em] text-[var(--text-muted)] mt-0.5">{user.role}</p>
              </div>
            </div>
            <button onClick={logout} className="btn-danger text-xs px-3 py-[7px]">Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-12 gap-5 lg:gap-6">{children}</div>;
}

export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border border-[var(--border)]" />
        <div className="absolute inset-0 rounded-full border border-transparent border-t-[var(--accent)] animate-spin" style={{ borderTopColor: 'var(--accent)' }} />
      </div>
      <p style={{ fontFamily: 'var(--font-mono)' }} className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Loading</p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      <div className="w-10 h-10 rounded-[8px] bg-[var(--background-secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] text-lg">—</div>
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 flex items-center gap-3">
      <div className="w-7 h-7 rounded-[6px] bg-[var(--danger-bg)] border border-[var(--danger-border)] flex items-center justify-center text-[var(--danger)] text-xs font-bold shrink-0">!</div>
      <p className="text-sm text-[var(--danger)]">{message}</p>
    </div>
  );
}
