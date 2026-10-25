import { Fragment, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../lib/store';
import { authFetch, apiFetch } from '../lib/api';
import type { ApiResponse, AdminUserProfile, AdminNote, ApiLogEntry } from '../lib/types';
import { LoadingSpinner, ErrorMessage, EmptyState } from '../components/Layout';

const STATUS_OPTIONS = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'];
const PLAN_OPTIONS = ['FREE', 'PREMIUM', 'PRO', 'UNLIMITED'];

function statusExplanation(code: number): string {
  if (code >= 200 && code < 300) return 'Success';
  if (code === 400) return 'Bad request — invalid parameters';
  if (code === 401) return 'Unauthorized — missing or invalid credentials';
  if (code === 403) return 'Forbidden — access denied for this resource';
  if (code === 404) return 'Not found';
  if (code === 429) return 'Rate limited — daily quota or burst limit exceeded';
  if (code >= 500) return 'Server error';
  if (code >= 400) return 'Client error';
  return 'Informational';
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1.5 text-sm text-[var(--text-primary)] break-words">{value ?? '—'}</p>
    </div>
  );
}

function Section({ title, hint, actions, children }: { title: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="editorial-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h3>
        {actions}
      </div>
      <div className="h-px w-full bg-[var(--border)] mb-4" />
      {hint && <p className="mb-4 text-xs text-[var(--text-muted)] leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch {}
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="badge badge-slate cursor-pointer hover:opacity-80 transition"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SecretPanel({ reveal, onClose }: { reveal: { key?: string; secret: string; label: string }; onClose: () => void }) {
  return (
    <div className="mb-4 rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-ink)]">
          {reveal.key ? 'New key created' : 'Secret rotated'} — {reveal.label}
        </p>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm" aria-label="Close">✕</button>
      </div>
      <div className="space-y-2">
        {reveal.key && (
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] w-10">Key</span>
            <code className="flex-1 min-w-0 text-sm text-[var(--text-primary)] break-all" style={{ fontFamily: 'var(--font-mono)' }}>{reveal.key}</code>
            <CopyButton text={reveal.key} />
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] w-10">Secret</span>
          <code className="flex-1 min-w-0 text-sm text-[var(--text-primary)] break-all" style={{ fontFamily: 'var(--font-mono)' }}>{reveal.secret}</code>
          <CopyButton text={reveal.secret} />
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">Shown only once. Store it securely — it cannot be retrieved again.</p>
    </div>
  );
}

function StateAccessMatrix({ userId, token, profile }: { userId: string; token: string; profile: AdminUserProfile['data'] }) {
  const qc = useQueryClient();
  const { data: statesResp, isError } = useQuery({
    queryKey: ['admin-state-matrix'],
    queryFn: () => apiFetch<ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>>('/v1/states'),
    staleTime: 300_000
  });
  const allStates = statesResp?.data ?? [];
  const granted = new Set(profile.states.map(s => s.id));

  const toggleMut = useMutation({
    mutationFn: ({ stateId, has }: { stateId: string; has: boolean }) =>
      has
        ? authFetch(`/admin/users/${userId}/state-access/${stateId}`, token, { method: 'DELETE' })
        : authFetch(`/admin/users/${userId}/state-access`, token, { method: 'POST', body: JSON.stringify({ stateId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-user', userId] })
  });
  const grantAllMut = useMutation({
    mutationFn: () => authFetch(`/admin/users/${userId}/grant-all-states`, token, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-user', userId] })
  });

  if (isError) return <p className="text-xs text-[var(--danger)]">Failed to load states list</p>;
  if (!statesResp) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {profile.counts.states} / {allStates.length} states granted
        </span>
        <button
          type="button"
          disabled={grantAllMut.isPending}
          onClick={() => { if (confirm('Grant access to ALL states for this user?')) grantAllMut.mutate(); }}
          className="btn-ghost text-xs disabled:opacity-40"
        >
          {grantAllMut.isPending ? 'Granting…' : 'Grant All States'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {allStates.map(s => {
        const has = granted.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            disabled={toggleMut.isPending}
            onClick={() => toggleMut.mutate({ stateId: s.id, has })}
            title={has ? `Granted — click to revoke ${s.label}` : `Not granted — click to grant ${s.label}`}
            className={`flex items-center gap-2 rounded-[7px] border px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
              has
                ? 'border-[rgba(14,124,91,0.35)] bg-[rgba(14,124,91,0.08)] text-[var(--text-primary)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)]'
                : 'border-[var(--border)] bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'
            }`}
          >
            <span className={`text-[11px] font-bold ${has ? 'text-[var(--accent-emerald)]' : 'text-[var(--text-muted)] opacity-60'}`}>{has ? '✓' : '○'}</span>
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}

function ApiKeysSection({ userId, token, profile }: { userId: string; token: string; profile: AdminUserProfile['data'] }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [reveal, setReveal] = useState<{ key?: string; secret: string; label: string } | null>(null);

  const createMut = useMutation({
    mutationFn: (newLabel: string) => authFetch<ApiResponse<{ id: string; key: string; secret: string; label: string }>>(`/admin/users/${userId}/api-keys`, token, { method: 'POST', body: JSON.stringify({ label: newLabel }) }),
    onSuccess: (res) => {
      setReveal({ key: res.data.key, secret: res.data.secret, label: res.data.label });
      setLabel('');
      qc.invalidateQueries({ queryKey: ['admin-user', userId] });
    }
  });
  const revokeMut = useMutation({
    mutationFn: (keyId: string) => authFetch(`/admin/users/${userId}/api-keys/${keyId}`, token, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-user', userId] })
  });
  const rotateMut = useMutation({
    mutationFn: (keyId: string) => authFetch<ApiResponse<{ id: string; secret: string }>>(`/admin/users/${userId}/api-keys/${keyId}/rotate-secret`, token, { method: 'POST' }),
    onSuccess: (res) => {
      setReveal({ secret: res.data.secret, label: 'rotated key' });
      qc.invalidateQueries({ queryKey: ['admin-user', userId] });
    }
  });

  const atLimit = profile.counts.activeKeys >= 5;

  return (
    <div>
      {reveal && <SecretPanel reveal={reveal} onClose={() => setReveal(null)} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          placeholder="Key label (e.g. production-server)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={60}
          className="input-field flex-1 min-w-[220px] !py-2"
        />
        <button
          type="button"
          disabled={!label.trim() || atLimit || createMut.isPending}
          onClick={() => createMut.mutate(label.trim())}
          className="btn-primary text-xs disabled:opacity-40"
        >
          {createMut.isPending ? 'Creating…' : '+ Create Key'}
        </button>
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] text-[var(--text-muted)] tabular-nums">
          {profile.counts.activeKeys}/5 active
        </span>
      </div>

      {createMut.error && <p className="mb-3 text-xs text-[var(--danger)]">{(createMut.error as Error).message}</p>}

      {profile.keys.length === 0 ? <EmptyState message="No API keys yet" /> : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Key</th><th>Label</th><th>Status</th><th>Last Used</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {profile.keys.map(k => (
                <tr key={k.id}>
                  <td className="font-mono text-xs text-[var(--accent)]">{k.keyMasked}</td>
                  <td className="font-medium text-[var(--text-primary)] text-sm">{k.label}</td>
                  <td><span className={`badge ${k.isActive ? 'badge-emerald' : 'badge-rose'}`}>{k.isActive ? 'Active' : 'Revoked'}</span></td>
                  <td className="tabular-nums text-xs text-[var(--text-muted)]">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td className="text-xs text-[var(--text-muted)]">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-1.5 flex-wrap">
                      {k.isActive && (
                        <>
                          <button
                            type="button"
                            disabled={rotateMut.isPending}
                            onClick={() => { if (confirm('Rotate the secret for this key? The old secret stops working immediately.')) rotateMut.mutate(k.id); }}
                            className="badge badge-amber cursor-pointer hover:opacity-80 transition"
                          >Rotate</button>
                          <button
                            type="button"
                            onClick={() => { if (confirm('Revoke this API key? Requests using it will fail.')) revokeMut.mutate(k.id); }}
                            className="badge badge-rose cursor-pointer hover:opacity-80 transition"
                          >Revoke</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequestHistory({ userId, token }: { userId: string; token: string }) {
  const [page, setPage] = useState(1);
  const [endpoint, setEndpoint] = useState('');
  const [statusGroup, setStatusGroup] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ userId, page: String(page), limit: String(limit) });
  if (endpoint) params.set('endpoint', endpoint);
  if (statusGroup) params.set('statusGroup', statusGroup);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-user-logs', userId, page, endpoint, statusGroup],
    queryFn: () => authFetch<ApiResponse<{ rows: ApiLogEntry[]; total: number; page: number; limit: number }>>(`/admin/api-logs?${params}`, token)
  });

  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const applyEndpointFilter = (ep: string) => { setEndpoint(ep); setPage(1); setExpandedId(null); };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input placeholder="Filter endpoint…" value={endpoint} onChange={e => { setEndpoint(e.target.value); setPage(1); }} className="input-field flex-1 min-w-[160px] !py-2" />
        <select value={statusGroup} onChange={e => { setStatusGroup(e.target.value); setPage(1); }} className="select-field min-w-[120px]">
          <option value="">All Status</option>
          <option value="2xx">2xx</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
        </select>
        {(endpoint || statusGroup) && (
          <button type="button" onClick={() => { setEndpoint(''); setStatusGroup(''); setPage(1); }} className="btn-ghost text-xs">Clear</button>
        )}
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)] tabular-nums">{total.toLocaleString()} requests</span>
      </div>

      {isLoading ? <LoadingSpinner /> : error ? <p className="py-6 text-center text-sm text-[var(--danger)]">Failed to load request history</p> : rows.length === 0 ? <EmptyState message="No requests match these filters" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Timestamp</th><th>Endpoint</th><th>Method</th><th>Status</th><th>Response</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map(l => (
                  <Fragment key={l.id}>
                    <tr
                      onClick={() => setExpandedId(prev => prev === l.id ? null : l.id)}
                      className="cursor-pointer"
                      style={{ background: expandedId === l.id ? 'var(--background-secondary)' : undefined }}
                    >
                      <td className="whitespace-nowrap tabular-nums text-xs">{new Date(l.timestamp).toLocaleString()}</td>
                      <td className="font-mono text-xs text-[var(--accent)]">{l.endpoint}</td>
                      <td><span className={`badge ${l.method === 'GET' ? 'badge-emerald' : 'badge-amber'}`}>{l.method}</span></td>
                      <td><span className={`badge ${l.statusCode < 300 ? 'badge-emerald' : l.statusCode < 500 ? 'badge-amber' : 'badge-rose'}`}>{l.statusCode}</span></td>
                      <td className="tabular-nums text-[var(--text-primary)] text-xs">{l.responseTime}ms</td>
                      <td className="text-[10px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{expandedId === l.id ? '▲ close' : '▼ drill down'}</td>
                    </tr>
                    {expandedId === l.id && (
                      <tr>
                        <td colSpan={6} className="!bg-[var(--background-secondary)] !p-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <Field label="Full Query" value={l.query ? <code className="text-xs text-[var(--accent)] break-all" style={{ fontFamily: 'var(--font-mono)' }}>{l.query}</code> : 'No query recorded'} />
                            <Field label="IP Address" value={<span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs">{l.ipAddress ?? '—'}</span>} />
                            <Field label="API Key" value={<span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs">{l.apiKeyMasked ?? '—'}</span>} />
                            <Field label="Status Meaning" value={<span className="text-xs">{statusExplanation(l.statusCode)}</span>} />
                            <Field label="Response Time" value={<span className="tabular-nums">{l.responseTime}ms</span>} />
                            <Field label="Timestamp" value={<span className="tabular-nums text-xs">{new Date(l.timestamp).toISOString()}</span>} />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => applyEndpointFilter(l.endpoint)} className="btn-ghost text-xs">Filter by this endpoint</button>
                            {l.query && <CopyButton text={l.query} />}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost disabled:opacity-30 text-xs">← Prev</button>
              <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)] tabular-nums">{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost disabled:opacity-30 text-xs">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NotesSection({ userId, token }: { userId: string; token: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-notes', userId],
    queryFn: () => authFetch<ApiResponse<AdminNote[]>>(`/admin/users/${userId}/notes`, token)
  });
  const addMut = useMutation({
    mutationFn: (body: string) => authFetch(`/admin/users/${userId}/notes`, token, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: ['admin-user-notes', userId] }); }
  });
  const deleteMut = useMutation({
    mutationFn: (noteId: string) => authFetch(`/admin/users/${userId}/notes/${noteId}`, token, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-user-notes', userId] })
  });

  const notes = data?.data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <textarea
          placeholder="Add an internal note for admin communication (visible to admins only)…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          className="input-field flex-1 !py-2 resize-y"
        />
        <button
          type="button"
          disabled={!draft.trim() || addMut.isPending}
          onClick={() => addMut.mutate(draft.trim())}
          className="btn-primary text-xs disabled:opacity-40 sm:self-stretch"
        >
          {addMut.isPending ? 'Adding…' : 'Add Note'}
        </button>
      </div>
      {addMut.error && <p className="mb-3 text-xs text-[var(--danger)]">{(addMut.error as Error).message}</p>}

      {isLoading ? <LoadingSpinner /> : notes.length === 0 ? <EmptyState message="No notes yet — start the conversation" /> : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="rounded-[7px] border border-[var(--border)] bg-[var(--background-secondary)] p-3.5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-[5px] bg-[var(--accent-violet)] flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                    {(n.authorEmail ?? '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate">{n.authorEmail}</span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { if (confirm('Delete this note?')) deleteMut.mutate(n.id); }}
                  className="text-[var(--text-muted)] hover:text-[var(--danger)] text-sm shrink-0"
                  title="Delete note"
                >✕</button>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Spec 11.2 / 11.3 — custom & temporary daily limits, auto-suspend toggle
function LimitConfigSection({ userId, token, profile }: { userId: string; token: string; profile: AdminUserProfile['data'] }) {
  const qc = useQueryClient();
  const { limitConfig, usage } = profile;
  const [dailyLimit, setDailyLimit] = useState<string>(limitConfig.dailyLimitOverride != null ? String(limitConfig.dailyLimitOverride) : '');
  const [expires, setExpires] = useState<string>(limitConfig.limitOverrideExpiresAt ? limitConfig.limitOverrideExpiresAt.slice(0, 10) : '');
  const [autoSuspend, setAutoSuspend] = useState(limitConfig.autoSuspendEnabled);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-user', userId] });
    qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    qc.invalidateQueries({ queryKey: ['admin-users-limits'] });
  };

  const applyMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { autoSuspendEnabled: autoSuspend };
      const n = dailyLimit.trim() === '' ? null : Number(dailyLimit);
      if (n !== null && Number.isFinite(n) && n >= 1) {
        body.dailyLimit = Math.floor(n);
        body.limitExpiresAt = expires ? new Date(expires + 'T00:00:00.000Z').toISOString() : null;
      }
      return authFetch(`/admin/users/${userId}`, token, { method: 'PATCH', body: JSON.stringify(body) });
    },
    onSuccess: invalidate,
    onError: invalidate
  });

  const clearMut = useMutation({
    mutationFn: () => authFetch(`/admin/users/${userId}/limit-override`, token, { method: 'DELETE' }),
    onSuccess: () => { setDailyLimit(''); setExpires(''); invalidate(); },
    onError: invalidate
  });

  const sourceLabel = usage.limitSource === 'override' ? 'Custom limit' : usage.limitSource === 'temporary' ? 'Temporary increase' : 'Plan default';

  return (
    <div className="mt-6 rounded-[10px] border border-[var(--border)] bg-[var(--background-secondary)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Limit Configuration</p>
        <span className="badge badge-slate text-[10px]">Effective limit {usage.dailyLimit.toLocaleString()} · {sourceLabel}{usage.limitExpiresAt ? ` · expires ${new Date(usage.limitExpiresAt).toLocaleDateString()}` : ''}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Custom daily limit</label>
          <input type="number" min={1} step={1} placeholder="e.g. 250000" value={dailyLimit}
            onChange={e => setDailyLimit(e.target.value)}
            className="input-field" />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Blank clears the custom value (revert to plan).</p>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Override expiry</label>
          <input type="date" value={expires}
            onChange={e => setExpires(e.target.value)}
            className="input-field" />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Empty = permanent custom limit. Set a date for a temporary increase.</p>
        </div>
        <div className="flex flex-col justify-end">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Auto-suspend on exceed</label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer select-none">
            <input type="checkbox" checked={autoSuspend} onChange={e => setAutoSuspend(e.target.checked)} className="accent-[var(--accent)]" />
            Suspend after limit exceeded
          </label>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Background job runs every 60s at {autoSuspend ? 'the configured' : '100%'} threshold.</p>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={() => applyMut.mutate()} disabled={applyMut.isPending} className="btn-primary text-xs">{applyMut.isPending ? 'Saving…' : 'Apply'}</button>
          <button onClick={() => { if (confirm('Clear the custom limit? The user returns to the plan default.')) clearMut.mutate(); }} disabled={clearMut.isPending} className="btn-ghost text-xs">Clear override</button>
        </div>
      </div>
      {clearMut.isError && <p className="mt-2 text-xs text-[var(--danger)]">Failed to clear override.</p>}
    </div>
  );
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { token } = useAppStore();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => authFetch<AdminUserProfile>(`/admin/users/${userId}`, token!),
    enabled: !!userId && !!token
  });

  const patchMut = useMutation({
    mutationFn: (body: { status?: string; planType?: string }) => authFetch(`/admin/users/${userId}`, token!, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', userId] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', userId] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  const backButton = (
    <button type="button" onClick={() => navigate('/admin')} className="btn-ghost text-xs mb-4">← Back to Admin Panel</button>
  );

  if (isLoading) return <>{backButton}<LoadingSpinner /></>;
  if (error || !data) return <>{backButton}<ErrorMessage message="Failed to load user detail. You may need admin access." /></>;
  if (!userId || !token) return <>{backButton}<ErrorMessage message="Missing user id or session." /></>;

  const u = data.data;
  const usage = u.usage;
  const pctUsed = usage.dailyLimit > 0 ? Math.round((usage.todayRequests / usage.dailyLimit) * 100) : 0;
  const planBadge: Record<string, string> = { UNLIMITED: 'badge-violet', PRO: 'badge-cyan', PREMIUM: 'badge-emerald', FREE: 'badge-slate' };

  return (
    <>
      {backButton}

      <div className="mb-5 editorial-card p-5 animate-fade-in flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-[9px] bg-[var(--accent)] flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
            {(u.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">User Detail</p>
            <h2 style={{ fontFamily: 'var(--font-display)' }} className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.015em] text-[var(--text-primary)] truncate">{u.businessName ?? u.email}</h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)] truncate">{u.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`badge ${u.status === 'ACTIVE' ? 'badge-emerald' : u.status === 'SUSPENDED' ? 'badge-rose' : 'badge-amber'}`}>{u.status.replace('_', ' ')}</span>
              <span className={`badge ${planBadge[u.planType] ?? 'badge-slate'}`}>{u.planType}</span>
              <span className="badge badge-slate">{u.role}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={u.status}
            onChange={e => patchMut.mutate({ status: e.target.value })}
            disabled={patchMut.isPending}
            className="select-field !py-1.5 !text-xs"
            title="Change account status"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select
            value={u.planType}
            onChange={e => patchMut.mutate({ planType: e.target.value })}
            disabled={patchMut.isPending}
            className="select-field !py-1.5 !text-xs"
            title="Change plan"
          >
            {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-4">
        <Section title="Profile" hint="Complete account information on file.">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Field label="Email" value={u.email} />
            <Field label="Business Name" value={u.businessName ?? '—'} />
            <Field label="GST Number" value={u.gstNumber ?? '—'} />
            <Field label="Phone" value={u.phoneNumber ?? '—'} />
            <Field label="Role" value={u.role} />
            <Field label="Plan" value={u.planType} />
            <Field label="Status" value={u.status.replace('_', ' ')} />
            <Field label="Last Request" value={usage.lastRequestAt ? new Date(usage.lastRequestAt).toLocaleString() : 'Never'} />
            <Field label="Registered" value={new Date(u.createdAt).toLocaleString()} />
            <Field label="Updated" value={new Date(u.updatedAt).toLocaleString()} />
          </div>
        </Section>

        <Section
          title="Plan & Usage"
          hint={`${u.planType} plan — ${pctUsed}% of daily quota used today${usage.limitSource !== 'plan' ? ` · ${usage.limitSource === 'temporary' ? 'temporary limit increase' : 'custom limit'} applied` : ''}.`}
          actions={<span style={{ fontFamily: 'var(--font-mono)' }} className="badge badge-slate text-[10px]">{u.counts.requests.toLocaleString()} lifetime</span>}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field label="Today" value={<span className="tabular-nums">{usage.todayRequests.toLocaleString()}</span>} />
            <Field label="This Month" value={<span className="tabular-nums">{usage.monthRequests.toLocaleString()}</span>} />
            <Field label="Total" value={<span className="tabular-nums">{usage.totalRequests.toLocaleString()}</span>} />
            <Field label="Avg Response (24h)" value={<span className="tabular-nums">{usage.avgResponseTime}ms</span>} />
            <Field label="Success Rate (30d)" value={<span className="tabular-nums">{usage.successRate}%</span>} />
            <Field label="Active Keys" value={<span className="tabular-nums">{u.counts.activeKeys} / {u.counts.apiKeys}</span>} />
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Daily quota</span>
              <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">{usage.todayRequests.toLocaleString()} / {usage.dailyLimit.toLocaleString()}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--background-secondary)] border border-[var(--border)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${pctUsed > 90 ? 'bg-[var(--danger)]' : pctUsed > 70 ? 'bg-[var(--accent-amber)]' : 'bg-[var(--accent-emerald)]'}`}
                style={{ width: `${Math.min(pctUsed, 100)}%` }}
              />
            </div>
            <LimitConfigSection userId={userId} token={token} profile={u} />
          </div>
        </Section>
      </div>

      <div className="mb-4">
        <Section
          title="State Access Matrix"
          hint="Click a state to grant or revoke query access. Green = granted."
        >
          <StateAccessMatrix userId={userId} token={token} profile={u} />
        </Section>
      </div>

      <div className="mb-4">
        <Section title="API Keys" hint="Create, revoke, or rotate credentials for this account. Secrets are shown only once at creation/rotation.">
          <ApiKeysSection userId={userId} token={token} profile={u} />
        </Section>
      </div>

      <div className="mb-4">
        <Section title="Request History" hint="Click any row to drill down into query, IP, API key and status details.">
          <RequestHistory userId={userId} token={token} />
        </Section>
      </div>

      <div>
        <Section title="Admin Notes" hint="Internal comments for admin communication — never visible to the client.">
          <NotesSection userId={userId} token={token} />
        </Section>
      </div>
    </>
  );
}
