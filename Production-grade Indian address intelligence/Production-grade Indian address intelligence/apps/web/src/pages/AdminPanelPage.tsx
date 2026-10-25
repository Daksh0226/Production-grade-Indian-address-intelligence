import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../lib/store';
import { authFetch, apiFetch } from '../lib/api';
import type { ApiResponse, UserData, ApiLogEntry, ApiKeyData, SearchItem, AdminAlerts, LimitUserRow } from '../lib/types';
import { SectionTitle, LoadingSpinner, EmptyState, StatCard } from '../components/Layout';

type Tab = 'users' | 'villages' | 'state-access' | 'logs' | 'api-keys' | 'limits';

export default function AdminPanelPage() {
  const { token } = useAppStore();
  const [tab, setTab] = useState<Tab>('users');
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  const tabs = [
    { id: 'users' as Tab, label: 'Users', icon: '◐' },
    { id: 'villages' as Tab, label: 'Villages', icon: '⬡' },
    { id: 'state-access' as Tab, label: 'State Access', icon: '◎' },
    { id: 'logs' as Tab, label: 'API Logs', icon: '☷' },
    { id: 'api-keys' as Tab, label: 'API Keys', icon: '⬢' },
    { id: 'limits' as Tab, label: 'Limits & Alerts', icon: '◇' }
  ];

  return (
    <>
      <SectionTitle eyebrow="Operations" title="Admin Panel" description="Manage users, monitor API usage and control platform access." />

      <div className="mb-5 flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 rounded-[7px] px-4 py-2 text-sm font-medium border transition-colors duration-200 ${tab === t.id ? 'tab-active border-transparent' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:border-[var(--border-hover)]'}`}>
            <span className="text-xs opacity-60">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="animate-fade-in">
        {tab === 'users' && <UsersTab token={token!} search={userSearch} status={statusFilter} plan={planFilter} onSearch={setUserSearch} onStatus={setStatusFilter} onPlan={setPlanFilter} />}
        {tab === 'villages' && <VillagesTab token={token!} />}
        {tab === 'state-access' && <StateAccessTab token={token!} />}
        {tab === 'logs' && <LogsTab token={token!} />}
        {tab === 'api-keys' && <ApiKeysTab token={token!} />}
        {tab === 'limits' && <LimitsAlertsTab token={token!} />}
      </div>
    </>
  );
}

function UsersTab({ token, search, status, plan, onSearch, onStatus, onPlan }: { token: string; search: string; status: string; plan: string; onSearch: (s: string) => void; onStatus: (s: string) => void; onPlan: (s: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (plan) params.set('planType', plan);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, status, plan],
    queryFn: () => authFetch<ApiResponse<UserData[]>>(`/admin/users?${params}`, token)
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => authFetch(`/admin/users/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] })
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/users/${id}`, token, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] })
  });

  if (isLoading) return <LoadingSpinner />;
  const users = data?.data ?? [];

  return (
    <div className="editorial-card p-4">
      <div className="flex flex-wrap gap-3 mb-4">
        <input placeholder="Search email or business…" value={search} onChange={e => onSearch(e.target.value)} className="input-field flex-1 min-w-[200px]" />
        <select value={status} onChange={e => onStatus(e.target.value)} className="select-field min-w-[140px]">
          <option value="">All Status</option>
          <option value="PENDING_APPROVAL">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={plan} onChange={e => onPlan(e.target.value)} className="select-field min-w-[140px]">
          <option value="">All Plans</option>
          <option value="FREE">Free</option>
          <option value="PREMIUM">Premium</option>
          <option value="PRO">Pro</option>
          <option value="UNLIMITED">Unlimited</option>
        </select>
      </div>

      {users.length === 0 ? <EmptyState message="No users found" /> : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Email</th><th>Business</th><th>Plan</th><th>Status</th><th>Requests</th><th>Keys</th><th>States</th><th>Registered</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="font-medium text-[var(--text-primary)]">{u.email}</td>
                  <td>{u.businessName ?? '—'}</td>
                  <td><span className={`badge ${u.planType === 'UNLIMITED' ? 'badge-violet' : u.planType === 'PRO' ? 'badge-cyan' : u.planType === 'PREMIUM' ? 'badge-emerald' : 'badge-slate'}`}>{u.planType}</span></td>
                  <td><span className={`badge ${u.status === 'ACTIVE' ? 'badge-emerald' : u.status === 'SUSPENDED' ? 'badge-rose' : 'badge-amber'}`}>{u.status.replace('_', ' ')}</span></td>
                  <td className="tabular-nums text-[var(--text-primary)]">{u.requestCount.toLocaleString()}</td>
                  <td className="tabular-nums text-[var(--text-muted)]">{u.apiKeyCount}</td>
                  <td className="tabular-nums text-[var(--text-muted)]">{u.states.length}</td>
                  <td className="whitespace-nowrap text-xs text-[var(--text-muted)]">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <button onClick={() => navigate(`/users/${u.id}`)} className="badge badge-cyan cursor-pointer hover:opacity-80 transition">View</button>
                      {u.status === 'PENDING_APPROVAL' && <button onClick={() => updateMut.mutate({ id: u.id, body: { status: 'ACTIVE' } })} className="badge badge-emerald cursor-pointer hover:opacity-80 transition">Approve</button>}
                      {u.status === 'ACTIVE' && <button onClick={() => updateMut.mutate({ id: u.id, body: { status: 'SUSPENDED' } })} className="badge badge-amber cursor-pointer hover:opacity-80 transition">Suspend</button>}
                      {u.status === 'SUSPENDED' && <button onClick={() => updateMut.mutate({ id: u.id, body: { status: 'ACTIVE' } })} className="badge badge-emerald cursor-pointer hover:opacity-80 transition">Reactivate</button>}
                      <select onChange={e => { if (e.target.value) { updateMut.mutate({ id: u.id, body: { planType: e.target.value } }); e.target.value = ''; } }} className="select-field !py-1 !px-2 !text-xs h-6">
                        <option value="">Plan</option><option value="FREE">Free</option><option value="PREMIUM">Premium</option><option value="PRO">Pro</option><option value="UNLIMITED">Unlimited</option>
                      </select>
                      <button onClick={() => { if (confirm('Delete user?')) deleteMut.mutate(u.id); }} className="badge badge-rose cursor-pointer hover:opacity-80 transition">Delete</button>
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

function VillagesTab({ token }: { token: string }) {
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [subDistrictId, setSubDistrictId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(500);
  const [jumpPage, setJumpPage] = useState('');

  // ── Hierarchy uses REAL database via apiFetch (X-API-Key), not authFetch ──
  // Single reliable query for states — no duplicate, no fake fallback
  const { data: statesData, isLoading: statesLoading, isError: statesIsError, error: statesError } = useQuery({
    queryKey: ['villages-states'],
    queryFn: () => apiFetch<ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>>('/v1/states'),
  });
  const states: Array<{ id: string; code: string; label: string; value: string }> = (statesData as ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>)?.data ?? [];

  const { data: districtsData, isLoading: districtsLoading, isError: districtsIsError, error: districtsError } = useQuery({
    queryKey: ['villages-districts', stateId],
    queryFn: () => apiFetch<ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>>(`/v1/states/${stateId}/districts`),
    enabled: !!stateId,
  });
  const districts: Array<{ id: string; code: string; label: string; value: string }> = (districtsData as ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>)?.data ?? [];

  const { data: subDistrictsData, isLoading: subDistrictsLoading, isError: subDistrictsIsError, error: subDistrictsError } = useQuery({
    queryKey: ['villages-subdistricts', districtId],
    queryFn: () => apiFetch<ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>>(`/v1/districts/${districtId}/subdistricts`),
    enabled: !!districtId,
  });
  const subDistricts: Array<{ id: string; code: string; label: string; value: string }> = (subDistrictsData as ApiResponse<Array<{ id: string; code: string; label: string; value: string }>>)?.data ?? [];

  // ── Village autocomplete — REAL API, filter-aware, debounced ──
  const selectedStateName = states.find(s => s.id === stateId)?.label ?? '';
  const selectedDistrictName = districts.find(d => d.id === districtId)?.label ?? '';
  const selectedSubDistrictName = subDistricts.find(s => s.id === subDistrictId)?.label ?? '';
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);

  // debounce 250ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setHighlighted(-1); }, [debouncedSearch, selectedStateName, selectedDistrictName, selectedSubDistrictName]);
  // close on outside click
  useEffect(() => {
    if (!isSearchFocused) return;
    const onDown = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) setIsSearchFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isSearchFocused]);
  // scroll highlighted into view
  useEffect(() => {
    if (highlighted < 0 || !suggestionListRef.current) return;
    const el = suggestionListRef.current.querySelector(`[data-index="${highlighted}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['village-autocomplete', debouncedSearch, selectedStateName, selectedDistrictName, selectedSubDistrictName],
    queryFn: async () => {
      const q = debouncedSearch.trim();
      if (q.length < 1) return { success: true, count: 0, data: [] as SearchItem[], meta: { requestId: '', responseTime: 0 } } as unknown as ApiResponse<SearchItem[]>;
      const params = new URLSearchParams({ q, hierarchyLevel: 'village' });
      if (selectedStateName) params.set('state', selectedStateName);
      if (selectedDistrictName) params.set('district', selectedDistrictName);
      if (selectedSubDistrictName) params.set('subDistrict', selectedSubDistrictName);
      try {
        return await apiFetch<ApiResponse<SearchItem[]>>(`/v1/autocomplete?${params.toString()}`);
      } catch (e: any) {
        // backend returns 400 for too short — treat as empty, not error
        if (String(e?.message).toLowerCase().includes('too short') || String(e?.message).includes('400')) {
          return { success: true, count: 0, data: [] as SearchItem[], meta: { requestId: '', responseTime: 0 } } as unknown as ApiResponse<SearchItem[]>;
        }
        throw e;
      }
    },
    enabled: debouncedSearch.trim().length >= 1 && isSearchFocused,
    retry: false,
    staleTime: 30_000,
  });
  const suggestions: SearchItem[] = (suggestionsData as ApiResponse<SearchItem[]>)?.data ?? [];
  const showSuggestions = isSearchFocused && search.trim().length >= 1;

  const handleSelectSuggestion = (item: SearchItem) => {
    const name = item.hierarchy?.village ?? item.label.split(' (')[0] ?? item.label;
    setSearch(name);
    setIsSearchFocused(false);
    setHighlighted(-1);
    setPage(1);
  };
  const handleClearSearch = () => {
    setSearch('');
    setIsSearchFocused(false);
    setHighlighted(-1);
    setDebouncedSearch('');
    setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (stateId) params.set('stateId', stateId);
  if (districtId) params.set('districtId', districtId);
  if (subDistrictId) params.set('subDistrictId', subDistrictId);
  if (search.trim()) params.set('search', search.trim());

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-villages', stateId, districtId, subDistrictId, search, page, limit],
    queryFn: () => authFetch<ApiResponse<{ rows: Array<{ stateName: string; districtName: string; subDistrictName: string; villageCode: string; villageName: string }>; page: number; limit: number; total: number }>>(`/admin/villages?${params}`, token),
  });

  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="editorial-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Village Master List — Data Browser (Spec 8.4)</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)] tabular-nums">{total.toLocaleString()} records</span>
      </div>
      <p className="mb-4 text-xs text-[var(--text-muted)]">Filter by hierarchy and search village names (partial match). Pagination supports 500 / 5,000 / 10,000 rows per page.</p>

      <div className="flex flex-wrap gap-3 mb-4 items-start">
        {/* State dropdown — real API data via apiFetch GET /v1/states */}
        <div className="min-w-[160px] flex flex-col gap-1">
          <select value={stateId} onChange={e => { setStateId(e.target.value); setDistrictId(''); setSubDistrictId(''); setPage(1); }} className="select-field">
            <option value="">{statesLoading ? 'Loading states...' : 'All States'}</option>
            {!statesLoading && !statesIsError && states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {statesLoading && <span className="text-xs text-[var(--text-muted)]">Loading states...</span>}
          {statesIsError && <span className="text-xs text-[var(--danger)]" title={String((statesError as any)?.message ?? statesError)}>Failed to load states</span>}
          {!statesLoading && !statesIsError && states.length === 0 && <span className="text-xs text-[var(--text-muted)]">No states available</span>}
        </div>
        {/* District — enabled only after State selected */}
        <div className="min-w-[160px] flex flex-col gap-1">
          <select value={districtId} onChange={e => { setDistrictId(e.target.value); setSubDistrictId(''); setPage(1); }} className="select-field" disabled={!stateId || districtsLoading}>
            <option value="">{!stateId ? 'Select state first' : districtsLoading ? 'Loading districts...' : 'All Districts'}</option>
            {!districtsLoading && !districtsIsError && districts.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          {stateId && districtsLoading && <span className="text-xs text-[var(--text-muted)]">Loading districts...</span>}
          {stateId && districtsIsError && <span className="text-xs text-[var(--danger)]">Failed to load districts</span>}
          {stateId && !districtsLoading && !districtsIsError && districts.length === 0 && <span className="text-xs text-[var(--text-muted)]">No districts available</span>}
        </div>
        {/* Sub-District — enabled only after District selected */}
        <div className="min-w-[160px] flex flex-col gap-1">
          <select value={subDistrictId} onChange={e => { setSubDistrictId(e.target.value); setPage(1); }} className="select-field" disabled={!districtId || subDistrictsLoading}>
            <option value="">{!districtId ? 'Select district first' : subDistrictsLoading ? 'Loading sub-districts...' : 'All Sub-Districts'}</option>
            {!subDistrictsLoading && !subDistrictsIsError && subDistricts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {districtId && subDistrictsLoading && <span className="text-xs text-[var(--text-muted)]">Loading sub-districts...</span>}
          {districtId && subDistrictsIsError && <span className="text-xs text-[var(--danger)]">Failed to load sub-districts</span>}
          {districtId && !subDistrictsLoading && !subDistrictsIsError && subDistricts.length === 0 && <span className="text-xs text-[var(--text-muted)]">No sub-districts available</span>}
        </div>
        {/* Village name search — REAL autocomplete dropdown */}
        <div ref={searchContainerRef} className="relative flex-1 min-w-[180px]">
          <input
            placeholder="Village name search…"
            value={search}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={e => { setSearch(e.target.value); setIsSearchFocused(true); setPage(1); }}
            onFocus={() => setIsSearchFocused(true)}
            onKeyDown={e => {
              if (showSuggestions && suggestions.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(prev => (prev + 1) % suggestions.length); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(prev => (prev - 1 + suggestions.length) % suggestions.length); }
                else if (e.key === 'Enter') {
                  if (highlighted >= 0 && suggestions[highlighted]) { e.preventDefault(); handleSelectSuggestion(suggestions[highlighted]); }
                } else if (e.key === 'Escape') { setIsSearchFocused(false); setHighlighted(-1); }
              } else {
                if (e.key === 'Escape') { setIsSearchFocused(false); setHighlighted(-1); }
              }
            }}
            className="input-field w-full pr-8"
          />
          {/* Clear X */}
          {search && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
          {/* Suggestions dropdown — DOWNWARD, same width, dark, high z-index */}
          {showSuggestions && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_32px_rgba(0,0,0,0.45),0_4px_12px_rgba(0,0,0,0.25)]"
              onMouseDown={e => e.preventDefault()}
            >
              <div ref={suggestionListRef} role="listbox" className="max-h-[260px] overflow-y-auto overscroll-contain py-1" style={{ scrollbarWidth: 'thin' }}>
                {suggestionsLoading ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-muted)]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                    Searching...
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No villages found</div>
                ) : (
                  suggestions.map((item, idx) => {
                    const isHighlighted = idx === highlighted;
                    const villageName = item.hierarchy?.village ?? item.label.split(' (')[0];
                    return (
                      <button
                        key={`${item.value}-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        data-index={idx}
                        onMouseEnter={() => setHighlighted(idx)}
                        onClick={() => handleSelectSuggestion(item)}
                        className={`flex w-full flex-col items-start px-3 py-[9px] text-left transition-colors ${isHighlighted ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)]'}`}
                      >
                        <span className={`text-sm leading-tight ${isHighlighted ? 'font-medium' : ''}`}>{villageName}</span>
                        {item.fullAddress && <span className="mt-0.5 line-clamp-1 text-xs text-[var(--text-muted)]">{item.fullAddress}</span>}
                        {item.hierarchy && (
                          <span className="mt-0.5 text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {[item.hierarchy.village, item.hierarchy.subDistrict, item.hierarchy.district, item.hierarchy.state].filter(Boolean).join(' • ')}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {!suggestionsLoading && suggestions.length > 0 && (
                <div className="border-t border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} • ↑↓ navigate • Enter select • Esc close
                </div>
              )}
            </div>
          )}
        </div>
        <select value={String(limit)} onChange={e => { setLimit(parseInt(e.target.value, 10)); setPage(1); }} className="select-field w-[140px]">
          <option value="500">500 / page</option>
          <option value="5000">5,000 / page</option>
          <option value="10000">10,000 / page</option>
        </select>
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost disabled:opacity-30 text-xs">← Prev</button>
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)] tabular-nums">Page {page} / {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-ghost disabled:opacity-30 text-xs">Next →</button>
        <div className="flex items-center gap-1.5 ml-2">
          <input placeholder="Jump to page" value={jumpPage} onChange={e => setJumpPage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(jumpPage, 10); if (n >= 1 && n <= totalPages) { setPage(n); setJumpPage(''); } } }} className="input-field !py-1 !px-2 !text-xs w-[110px]" />
          <button onClick={() => { const n = parseInt(jumpPage, 10); if (n >= 1 && n <= totalPages) { setPage(n); setJumpPage(''); } }} className="btn-ghost text-xs">Go</button>
        </div>
        <span className="ml-auto text-xs text-[var(--text-muted)]">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
      </div>

      {isLoading ? <LoadingSpinner /> : error ? <div className="py-6 text-center text-sm text-[var(--danger)]">Failed to load villages — admin access required.</div> : rows.length === 0 ? <EmptyState message="No villages found for current filters" /> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>State Name</th><th>District Name</th><th>Sub-District Name</th><th>Village Code</th><th>Village Name</th></tr></thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.villageCode}-${idx}`}>
                  <td className="text-sm text-[var(--text-primary)]">{r.stateName}</td>
                  <td className="text-sm">{r.districtName}</td>
                  <td className="text-sm">{r.subDistrictName}</td>
                  <td className="font-mono text-xs text-[var(--accent)]">{r.villageCode}</td>
                  <td className="font-medium text-[var(--text-primary)]">{r.villageName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StateAccessTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedStateId, setSelectedStateId] = useState('');
  const [region, setRegion] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: () => authFetch<ApiResponse<UserData[]>>('/admin/users', token),
  });
  const users = usersData?.data ?? [];

  const { data: statesData, isLoading: statesLoading } = useQuery({
    queryKey: ['state-access-states'],
    queryFn: () => apiFetch<ApiResponse<Array<{ id: string; label: string; code: string }>>>('/v1/states'),
  });
  const states: Array<{ id: string; label: string; code: string }> = (statesData as ApiResponse<Array<{ id: string; label: string; code: string }>>)?.data ?? [];

  const selectedUser = users.find(u => u.id === selectedUserId);

  const regionMap: Record<string, string[]> = {
    North: ['Haryana', 'Himachal Pradesh', 'Punjab', 'Rajasthan', 'Uttar Pradesh', 'Uttarakhand', 'Delhi', 'Chandigarh', 'Jammu and Kashmir', 'Ladakh'],
    South: ['Andhra Pradesh', 'Karnataka', 'Kerala', 'Tamil Nadu', 'Telangana', 'Puducherry', 'Lakshadweep', 'Andaman and Nicobar Islands'],
    East: ['Bihar', 'Jharkhand', 'West Bengal', 'Odisha', 'Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'],
    West: ['Gujarat', 'Maharashtra', 'Goa', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Madhya Pradesh', 'Chhattisgarh'],
  };

  const grantSingle = useMutation({
    mutationFn: (stateId: string) => authFetch(`/admin/users/${selectedUserId}/state-access`, token, { method: 'POST', body: JSON.stringify({ stateId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users-list'] }),
  });
  const revokeSingle = useMutation({
    mutationFn: (stateId: string) => authFetch(`/admin/users/${selectedUserId}/state-access/${stateId}`, token, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users-list'] }),
  });
  const grantAll = useMutation({
    mutationFn: () => authFetch(`/admin/users/${selectedUserId}/grant-all-states`, token, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users-list'] }),
  });
  const grantRegion = useMutation({
    mutationFn: async (reg: string) => {
      const names = regionMap[reg] ?? [];
      const ids = states.filter(s => names.some(n => (s.label ?? '').toLowerCase().includes(n.toLowerCase()) || (s as any).name?.toLowerCase().includes(n.toLowerCase()))).map(s => s.id);
      for (const id of ids) { await authFetch(`/admin/users/${selectedUserId}/state-access`, token, { method: 'POST', body: JSON.stringify({ stateId: id }) }); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users-list'] }),
  });

  return (
    <div className="editorial-card p-4">
      <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1">State Access Management (Spec 8.3)</p>
      <div className="h-px w-full bg-[var(--border)] mb-4" />
      <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">Grant/revoke state-level access. Options: all states (full India), specific states from dropdown, or by region (North/South/East/West). Audit is visible via API logs.</p>

      <div className="flex flex-wrap gap-3 mb-5">
        <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="select-field flex-1 min-w-[220px]">
          <option value="">Select user…</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.email} — {u.businessName ?? '—'} ({u.planType})</option>)}
        </select>
        <button onClick={() => grantAll.mutate()} disabled={!selectedUserId || grantAll.isPending} className="btn-primary text-xs disabled:opacity-40">{grantAll.isPending ? 'Granting…' : 'Grant All States'}</button>
      </div>

      {selectedUser ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <select value={selectedStateId} onChange={e => setSelectedStateId(e.target.value)} className="select-field min-w-[200px]">
              <option value="">{statesLoading ? 'Loading states...' : 'Select state...'}</option>
              {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={() => selectedStateId && grantSingle.mutate(selectedStateId)} disabled={!selectedStateId || grantSingle.isPending} className="btn-ghost text-xs disabled:opacity-40">Grant Selected</button>
            <select value={region} onChange={e => setRegion(e.target.value)} className="select-field min-w-[140px]">
              <option value="">By region…</option>
              <option value="North">North</option><option value="South">South</option><option value="East">East</option><option value="West">West</option>
            </select>
            <button onClick={() => region && grantRegion.mutate(region)} disabled={!region || grantRegion.isPending} className="btn-ghost text-xs disabled:opacity-40">{grantRegion.isPending ? 'Granting…' : 'Grant Region'}</button>
          </div>

          <div className="rounded-[7px] border border-[var(--border)] bg-[var(--background-secondary)] p-3">
            <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">Current access for {selectedUser.email} — {selectedUser.states.length} states</p>
            {selectedUser.states.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No state access granted.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {selectedUser.states.map(name => {
                  const st = states.find(s => (s.label ?? (s as any).name) === name);
                  return (
                    <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--text-primary)]">
                      {name}
                      {st && <button onClick={() => revokeSingle.mutate(st.id)} className="ml-1 text-[var(--text-muted)] hover:text-[var(--danger)]" title="Revoke">×</button>}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Select a user to manage state access.</p>
      )}
    </div>
  );
}

function LogsTab({ token }: { token: string }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [statusGroup, setStatusGroup] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (endpoint) params.set('endpoint', endpoint);
  if (statusGroup) params.set('statusGroup', statusGroup);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', dateFrom, dateTo, endpoint, statusGroup, page],
    queryFn: () => authFetch<ApiResponse<{ rows: ApiLogEntry[]; total: number; page: number; limit: number }>>(`/admin/api-logs?${params}`, token)
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const exportCsv = () => {
    if (!rows.length) return;
    const header = ['timestamp','user','endpoint','method','status','responseTime','ip'];
    const lines = [header.join(',')].concat(rows.map(r => [`"${new Date(r.timestamp).toISOString()}"`, `"${(r.businessName ?? r.userEmail ?? '').replace(/"/g,'""')}"`, `"${r.endpoint}"`, r.method, r.statusCode, r.responseTime, `"${r.ipAddress ?? ''}"`].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `api-logs-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportJson = () => {
    if (!rows.length) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `api-logs-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="editorial-card p-4">
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="input-field !w-auto" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="input-field !w-auto" />
        <input placeholder="Endpoint…" value={endpoint} onChange={e => { setEndpoint(e.target.value); setPage(1); }} className="input-field flex-1 min-w-[150px]" />
        <select value={statusGroup} onChange={e => { setStatusGroup(e.target.value); setPage(1); }} className="select-field">
          <option value="">All Status</option><option value="2xx">2xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option>
        </select>
        <span style={{ fontFamily: 'var(--font-mono)' }} className="self-center text-xs text-[var(--text-muted)] tracking-wide">{total} entries</span>
        <div className="ml-auto flex gap-2">
          <button onClick={exportCsv} disabled={!rows.length} className="btn-ghost text-xs disabled:opacity-30">Download CSV</button>
          <button onClick={exportJson} disabled={!rows.length} className="btn-ghost text-xs disabled:opacity-30">Download JSON</button>
        </div>
      </div>
      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState message="No logs found" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Timestamp</th><th>User</th><th>Endpoint</th><th>Method</th><th>Status</th><th>Response</th><th>IP</th></tr></thead>
              <tbody>
                {rows.map(l => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap tabular-nums text-xs">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="text-xs">{l.businessName ?? l.userEmail ?? '—'}</td>
                    <td className="font-mono text-xs text-[var(--accent)]">{l.endpoint}</td>
                    <td><span className={`badge ${l.method === 'GET' ? 'badge-emerald' : 'badge-amber'}`}>{l.method}</span></td>
                    <td><span className={`badge ${l.statusCode < 300 ? 'badge-emerald' : l.statusCode < 500 ? 'badge-amber' : 'badge-rose'}`}>{l.statusCode}</span></td>
                    <td className="tabular-nums text-[var(--text-primary)] text-xs">{l.responseTime}ms</td>
                    <td className="text-[var(--text-muted)] text-xs">{l.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost disabled:opacity-30 text-xs">← Prev</button>
              <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)] tabular-nums">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost disabled:opacity-30 text-xs">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ApiKeysTab({ token }: { token: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin-api-keys'], queryFn: () => authFetch<ApiResponse<ApiKeyData[]>>('/admin/api-keys', token) });
  const keys = data?.data ?? [];
  return (
    <div className="editorial-card p-4">
      {isLoading ? <LoadingSpinner /> : keys.length === 0 ? <EmptyState message="No API keys found" /> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Key</th><th>Label</th><th>User</th><th>Status</th><th>Last Used</th><th>Created</th></tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td className="font-mono text-xs text-[var(--accent)]">{k.keyMasked}</td>
                  <td className="font-medium text-[var(--text-primary)] text-sm">{k.label}</td>
                  <td className="text-sm">{k.userEmail}</td>
                  <td><span className={`badge ${k.isActive ? 'badge-emerald' : 'badge-rose'}`}>{k.isActive ? 'Active' : 'Revoked'}</span></td>
                  <td className="tabular-nums text-xs text-[var(--text-muted)]">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td className="text-xs text-[var(--text-muted)]">{new Date(k.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  LIMIT_80: '80% limit',
  LIMIT_95: '95% limit',
  LIMIT_EXCEEDED: 'Limit exceeded',
  AUTO_SUSPENDED: 'Auto-suspended',
  USAGE_SPIKE: 'Traffic spike',
  HIGH_ERROR_RATE: 'High error rate'
};

function alertBadgeCls(kind: string) {
  return kind === 'AUTO_SUSPENDED' || kind === 'LIMIT_EXCEEDED' || kind === 'HIGH_ERROR_RATE' ? 'badge-rose' : 'badge-amber';
}

function pctColor(pct: number) {
  return pct >= 95 ? 'text-[var(--danger)]' : pct >= 80 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-emerald)]';
}

function stateBadge(l: LimitUserRow) {
  if (l.state === 'EXCEEDED' || l.state === 'EXCEEDED_BLOCKED') return { cls: 'badge-rose', label: l.state === 'EXCEEDED_BLOCKED' ? 'Blocked' : 'Exceeded' };
  if (l.state === 'CRITICAL') return { cls: 'badge-rose', label: 'Critical' };
  if (l.state === 'WARNING') return { cls: 'badge-amber', label: 'Warning' };
  if (l.state === 'SUSPENDED') return { cls: 'badge-rose', label: 'Suspended' };
  return { cls: 'badge-emerald', label: 'OK' };
}

// Spec 11.2 / 11.3 — user limit utilisation + admin alerting
function LimitsAlertsTab({ token }: { token: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: () => authFetch<AdminAlerts>('/admin/alerts', token),
    refetchInterval: 30_000
  });

  const { data: limitsData, isLoading: limitsLoading } = useQuery({
    queryKey: ['admin-users-limits'],
    queryFn: () => authFetch<ApiResponse<LimitUserRow[]>>('/admin/users/limits', token),
    refetchInterval: 30_000
  });

  const alerts = data?.data;
  const limits = limitsData?.data ?? [];
  const approaching = limits.filter(l => l.pct >= 80).length;
  const unusual = alerts?.unusual ?? [];
  const recent = alerts?.recentAlerts ?? [];
  const cap = alerts?.capacity;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="System Load" value={cap ? `${cap.perMinute}/min` : '—'} hint={cap ? `${cap.pct.toFixed(1)}% of burst capacity` : 'Calculating…'} accent={cap?.critical || (cap && cap.pct >= 50) ? 'amber' : 'emerald'} />
        <StatCard label="Approaching Limit" value={String(approaching)} hint="Users at 80%+ of limit (7-day peak)" accent={approaching > 0 ? 'amber' : 'emerald'} />
        <StatCard label="Unusual Patterns" value={String(unusual.length)} hint="Spikes / error-rate anomalies" accent={unusual.length > 0 ? 'amber' : 'emerald'} />
        <StatCard label="Usage Alerts" value={String(recent.length)} hint="Email + dashboard events (last 25)" accent="violet" />
      </div>

      {isLoading || limitsLoading ? <LoadingSpinner /> : (
        <>
          <div className="editorial-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold text-[var(--text-primary)]">User Limit Utilisation</h3>
              <span className="badge badge-slate text-[10px]">Spec 11.2 · all client accounts · peak of last 7 days</span>
            </div>
            <div className="h-px w-full bg-[var(--border)] mb-4" />
            {limits.length === 0 ? <EmptyState message="No client accounts found." /> : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>User</th><th>Plan</th><th>Status</th><th>Peak Usage (7d)</th><th>Limit Source</th><th>Auto-suspend</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {limits.map(l => {
                      const sb = stateBadge(l);
                      return (
                        <tr key={l.id}>
                          <td>
                            <button onClick={() => navigate(`/users/${l.id}`)} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition text-sm cursor-pointer">{l.email}</button>
                            {l.businessName && <span className="block text-xs text-[var(--text-muted)]">{l.businessName}</span>}
                          </td>
                          <td><span className="badge badge-slate">{l.planType}</span></td>
                          <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span style={{ fontFamily: 'var(--font-mono)' }} className={`text-xs font-semibold tabular-nums ${pctColor(l.pct)}`}>{l.pct.toFixed(1)}%</span>
                              <div className="h-1.5 flex-1 min-w-[80px] overflow-hidden rounded-full bg-[var(--background-secondary)] border border-[var(--border)]">
                                <div className={`h-full rounded-full ${l.pct >= 95 ? 'bg-[var(--danger)]' : l.pct >= 80 ? 'bg-[var(--accent-amber)]' : 'bg-[var(--accent-emerald)]'}`} style={{ width: `${Math.min(l.pct, 100)}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-[var(--text-muted)] shrink-0">{l.used.toLocaleString()} / {l.limit.toLocaleString()}</span>
                              {l.peakDate && <span className="text-[10px] tabular-nums text-[var(--text-muted)] shrink-0">{l.peakDate}</span>}
                            </div>
                          </td>
                          <td>
                            <span className="text-xs text-[var(--text-muted)]">{l.limitSource === 'temporary' ? `Temp increase${l.limitExpiresAt ? ` · expires ${new Date(l.limitExpiresAt).toLocaleDateString()}` : ''}` : l.limitSource === 'override' ? 'Custom limit' : 'Plan default'}</span>
                          </td>
                          <td>{l.autoSuspendEnabled ? <span className="badge badge-amber">Enabled</span> : <span className="badge badge-slate">Off</span>}</td>
                          <td>
                            <button onClick={() => navigate(`/users/${l.id}`)} className="badge badge-slate hover:opacity-80 transition cursor-pointer">Manage</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="editorial-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold text-[var(--text-primary)]">Unusual Usage Patterns</h3>
              <span className="badge badge-slate text-[10px]">Spec 11.3 · spikes & error rates</span>
            </div>
            <div className="h-px w-full bg-[var(--border)] mb-4" />
            {unusual.length === 0 ? <EmptyState message="No unusual usage patterns detected." /> : (
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Signal</th><th>Detail</th><th>Action</th></tr></thead>
                  <tbody>
                    {unusual.map((u, i) => (
                      <tr key={`${u.userId}-${i}`}>
                        <td className="text-sm font-medium text-[var(--text-primary)]">{u.email}{u.businessName && <span className="block text-xs text-[var(--text-muted)]">{u.businessName}</span>}</td>
                        <td><span className="badge badge-rose">{u.type === 'SPIKE' ? 'Traffic spike' : 'High error rate'}</span></td>
                        <td className="text-xs text-[var(--text-muted)]">{u.type === 'SPIKE' ? `Peak ${u.today?.toLocaleString()}${u.date ? ` on ${u.date}` : ''} vs ${u.avg7?.toLocaleString()}/day avg (${u.factor}×)` : `${u.errors?.toLocaleString()}/${u.total?.toLocaleString()} failed (${u.ratio}%)`}</td>
                        <td><button onClick={() => navigate(`/users/${u.userId}`)} className="badge badge-slate hover:opacity-80 transition cursor-pointer">Investigate</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="editorial-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold text-[var(--text-primary)]">Recent Usage Alerts</h3>
              <span className="badge badge-slate text-[10px]">Email & dashboard notifications</span>
            </div>
            <div className="h-px w-full bg-[var(--border)] mb-4" />
            {recent.length === 0 ? <EmptyState message="No usage alerts have been sent yet." /> : (
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Alert</th><th>Usage</th><th>Email</th><th>Sent</th></tr></thead>
                  <tbody>
                    {recent.map(a => (
                      <tr key={a.id}>
                        <td className="text-sm font-medium text-[var(--text-primary)]">{a.email}</td>
                        <td><span className={`badge ${alertBadgeCls(a.kind)}`}>{KIND_LABEL[a.kind] ?? a.kind}</span></td>
                        <td className="text-xs tabular-nums text-[var(--text-muted)]">{a.kind === 'USAGE_SPIKE' ? `${a.used.toLocaleString()} peak vs ${a.limit.toLocaleString()}/day avg` : a.kind === 'HIGH_ERROR_RATE' ? `${a.used.toLocaleString()} failed of ${a.limit.toLocaleString()}` : `${a.used.toLocaleString()} / ${a.limit.toLocaleString()}`}</td>
                        <td className="text-xs">{a.emailStatus === 'SENT' ? <span className="badge badge-emerald">Sent</span> : a.emailStatus === 'FAILED' ? <span className="badge badge-rose">Failed</span> : <span className="badge badge-slate">Logged</span>}</td>
                        <td className="text-xs text-[var(--text-muted)]">{a.sentAt ? new Date(a.sentAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
