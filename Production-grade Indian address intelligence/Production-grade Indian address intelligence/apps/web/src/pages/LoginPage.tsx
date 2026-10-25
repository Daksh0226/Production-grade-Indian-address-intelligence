import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { apiFetch } from '../lib/api';
import { ThemeToggleButton } from '../components/Layout';
import type { ApiResponse, AuthPayload } from '../lib/types';

export default function LoginPage() {
  const { setToken, setUser } = useAppStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ email: '', password: '', confirmPassword: '', businessName: '', gstNumber: '', phoneNumber: '' });
  const [regMsg, setRegMsg] = useState('');

  const freeEmailDomains = ['gmail.com','yahoo.com','yahoo.co.in','hotmail.com','outlook.com','aol.com','protonmail.com','icloud.com','rediffmail.com'];
  function isFreeEmail(email: string) {
    const domain = email.split('@')[1]?.toLowerCase();
    return domain ? freeEmailDomains.includes(domain) : false;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try { const res = await apiFetch<ApiResponse<AuthPayload>>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setToken(res.data.token); setUser(res.data.user); navigate('/'); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setRegMsg(''); setError('');
    if (isFreeEmail(regForm.email)) { setError('Please use your business email — free providers (gmail, yahoo, etc.) are not allowed.'); setLoading(false); return; }
    if (regForm.password !== regForm.confirmPassword) { setError('Passwords do not match.'); setLoading(false); return; }
    if (regForm.password.length < 8 || !/[A-Z]/.test(regForm.password) || !/[0-9]/.test(regForm.password)) { setError('Password must be at least 8 characters and include an uppercase letter and a number.'); setLoading(false); return; }
    try { const { confirmPassword, ...payload } = regForm as any; const res = await apiFetch<ApiResponse<{ message: string }>>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }); setRegMsg(res.data.message); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 bg-[var(--background)]">
      <div className="absolute top-4 right-4 z-20"><ThemeToggleButton /></div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[420px] bg-[var(--border)] opacity-[0.12] blur-[60px] rounded-full" />
      </div>

      <div className="relative w-full max-w-[420px] animate-fade-in">
        <div className="text-center mb-6">
          <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Village API</p>
          <div className="mx-auto mt-2 h-px w-8 bg-[var(--border)]" />
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="mt-3 text-[28px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Geo SaaS Platform</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">Production-grade Indian address intelligence</p>
        </div>

        <div className="editorial-card p-6 sm:p-7">
          <div className="mb-5">
            <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-[20px] font-bold tracking-[-0.015em] text-[var(--text-primary)]">{showRegister ? 'Create account' : 'Welcome back'}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{showRegister ? 'Register for API access' : 'Sign in to your dashboard'}</p>
            <div className="mt-3 h-px w-full bg-[var(--border)]" />
          </div>

          {error && <div className="mb-4 rounded-[7px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5 flex items-center gap-2"><span className="text-[var(--danger)] text-xs">●</span><p className="text-sm text-[var(--danger)]">{error}</p></div>}
          {regMsg && <div className="mb-4 rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2.5 flex items-center gap-2"><span className="text-[var(--accent)] text-xs">✓</span><p className="text-sm text-[var(--text-primary)]">{regMsg}</p></div>}

          {!showRegister ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Email</label><input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} className="input-field" required /></div>
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Password</label><input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="input-field" required /></div>
              <button type="submit" disabled={loading} className="btn-primary w-full mt-1">{loading ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</span> : 'Sign In'}</button>
              <p className="text-center text-sm text-[var(--text-muted)] pt-1">Don’t have an account? <button type="button" onClick={() => { setShowRegister(true); setError(''); }} className="text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium">Register</button></p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Business Name *</label><input type="text" placeholder="Acme Corp (registered company name)" value={regForm.businessName} onChange={e => setRegForm(f => ({ ...f, businessName: e.target.value }))} className="input-field" required /></div>
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Business Email *</label><input type="email" placeholder="you@company.com (no gmail/yahoo)" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} className="input-field" required /><p className="mt-1 text-[11px] text-[var(--text-muted)]">Free email providers are not allowed.</p></div>
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">GST Number <span className="normal-case tracking-normal text-[11px] opacity-60">(optional, for future invoicing)</span></label><input type="text" placeholder="22AAAAA0000A1Z5" value={regForm.gstNumber} onChange={e => setRegForm(f => ({ ...f, gstNumber: e.target.value }))} className="input-field" /></div>
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Phone Number <span className="normal-case tracking-normal text-[11px] opacity-60">(with country code)</span></label><input type="tel" placeholder="+91 99999 99999" value={regForm.phoneNumber} onChange={e => setRegForm(f => ({ ...f, phoneNumber: e.target.value }))} className="input-field" /></div>
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Password *</label><input type="password" placeholder="Min 8 characters, uppercase + number" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} className="input-field" required minLength={8} /></div>
              <div><label style={{ fontFamily: 'var(--font-mono)' }} className="block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1.5">Confirm Password *</label><input type="password" placeholder="Re-enter password" value={regForm.confirmPassword} onChange={e => setRegForm(f => ({ ...f, confirmPassword: e.target.value }))} className="input-field" required minLength={8} /></div>
              <button type="submit" disabled={loading} className="btn-primary w-full mt-1">{loading ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Registering…</span> : 'Create Account'}</button>
              <p className="text-center text-sm text-[var(--text-muted)] pt-1">Already have an account? <button type="button" onClick={() => { setShowRegister(false); setError(''); setRegMsg(''); }} className="text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium">Sign in</button></p>
            </form>
          )}
          <p style={{ fontFamily: 'var(--font-mono)' }} className="mt-6 text-center text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Secure • Private • Production-ready</p>
        </div>
      </div>
    </div>
  );
}
