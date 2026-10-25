import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { ApiResponse, SearchItem } from '../lib/types';
import { SectionTitle, LoadingSpinner } from '../components/Layout';
import SearchableDropdown from '../components/SearchableDropdown';

type Option = { id: string; code: string; label: string; value: string };

function ContactFormDemo() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [villageQuery, setVillageQuery] = useState('');
  const [debouncedVillageQuery, setDebouncedVillageQuery] = useState('');
  const [isVillageFocused, setIsVillageFocused] = useState(false);
  const [suggestionHighlighted, setSuggestionHighlighted] = useState(-1);
  const [selectedAddress, setSelectedAddress] = useState<SearchItem | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const villageRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedVillageQuery(villageQuery), 250); return () => clearTimeout(t); }, [villageQuery]);
  useEffect(() => { setSuggestionHighlighted(-1); }, [debouncedVillageQuery]);
  useEffect(() => {
    if (!isVillageFocused) return;
    const handler = (e: MouseEvent) => { if (villageRef.current && !villageRef.current.contains(e.target as Node)) setIsVillageFocused(false); };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, [isVillageFocused]);
  useEffect(() => {
    if (suggestionHighlighted < 0 || !suggestionListRef.current) return;
    const el = suggestionListRef.current.querySelector(`[data-suggestion-index="${suggestionHighlighted}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [suggestionHighlighted]);

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['contact-village-suggestions', debouncedVillageQuery],
    queryFn: async () => {
      const q = debouncedVillageQuery.trim();
      if (q.length < 2) return { success: true, count: 0, data: [] as SearchItem[], meta: { requestId: '', responseTime: 0 } } as unknown as ApiResponse<SearchItem[]>;
      const params = new URLSearchParams({ q, hierarchyLevel: 'village' });
      try { return await apiFetch<ApiResponse<SearchItem[]>>(`/v1/autocomplete?${params.toString()}`); } catch { return { success: true, count: 0, data: [] as SearchItem[], meta: { requestId: '', responseTime: 0 } } as unknown as ApiResponse<SearchItem[]>; }
    },
    enabled: debouncedVillageQuery.trim().length >= 2 && isVillageFocused,
    retry: false,
  });
  const suggestions: SearchItem[] = suggestionsData?.data ?? [];
  const showDropdown = isVillageFocused && villageQuery.trim().length >= 2 && (suggestionsLoading || suggestions.length > 0);

  const handleSelectVillage = (item: SearchItem) => {
    setVillageQuery(item.hierarchy?.village ?? item.label.split(' (')[0]);
    setSelectedAddress(item);
    setIsVillageFocused(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div className="editorial-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--accent)]">Demo — Contact Form with Address Autocomplete (Spec 13.2)</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="badge badge-slate text-[10px]">Village API demo</span>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-5 leading-relaxed">Type a village name (min 2 chars) — suggestions come from <span className="font-mono text-[var(--accent)]">/v1/autocomplete</span>. On selection, sub-district/district/state/country auto-populate.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Full Name *</label><input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Priya Sharma" className="input-field" required /></div>
          <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Email Address *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="priya@example.com" className="input-field" required /></div>
        </div>
        <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Phone Number *</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="input-field" required /></div>

        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--background-secondary)] p-4 space-y-3">
          <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Address Section (powered by Village API)</p>
          <div ref={villageRef} className="relative">
            <label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Village / Area *</label>
            <input value={villageQuery} autoComplete="off" onChange={e => { setVillageQuery(e.target.value); setIsVillageFocused(true); setSelectedAddress(null); }} onFocus={() => setIsVillageFocused(true)} onKeyDown={e => {
              if (showDropdown && suggestions.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionHighlighted(prev => (prev + 1) % suggestions.length); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionHighlighted(prev => (prev - 1 + suggestions.length) % suggestions.length); }
                else if (e.key === 'Enter' && suggestionHighlighted >= 0) { e.preventDefault(); handleSelectVillage(suggestions[suggestionHighlighted]); }
                else if (e.key === 'Escape') setIsVillageFocused(false);
              }
            }} placeholder="Start typing e.g. Manibeli" className="input-field" required />
            {showDropdown && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]" onMouseDown={e => e.preventDefault()}>
                <div ref={suggestionListRef} className="max-h-[220px] overflow-y-auto py-1">
                  {suggestionsLoading ? <div className="px-3 py-3 text-sm text-[var(--text-muted)]">Searching…</div> : suggestions.length === 0 ? <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No villages found</div> : suggestions.map((item, idx) => (
                    <button key={`${item.value}-${idx}`} type="button" data-suggestion-index={idx} onMouseEnter={() => setSuggestionHighlighted(idx)} onClick={() => handleSelectVillage(item)} className={`flex w-full flex-col items-start px-3 py-2 text-left ${idx === suggestionHighlighted ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'}`}>
                      <span className="text-sm">{item.hierarchy?.village ?? item.label}</span>
                      <span className="text-xs text-[var(--text-muted)]">{item.fullAddress}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Sub-District</label><input value={selectedAddress?.hierarchy?.subDistrict ?? ''} placeholder="Auto-filled" className="input-field opacity-70" readOnly /></div>
            <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">District</label><input value={selectedAddress?.hierarchy?.district ?? ''} placeholder="Auto-filled" className="input-field opacity-70" readOnly /></div>
            <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">State</label><input value={selectedAddress?.hierarchy?.state ?? ''} placeholder="Auto-filled" className="input-field opacity-70" readOnly /></div>
            <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Country</label><input value={selectedAddress?.hierarchy?.country ?? 'India'} placeholder="India" className="input-field opacity-70" readOnly /></div>
          </div>
          {selectedAddress && <p className="text-xs text-[var(--accent-emerald)]">✓ Standardized: {selectedAddress.fullAddress}</p>}
        </div>

        <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Message</label><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Your message…" rows={3} className="input-field resize-none" /></div>
        <button type="submit" className="btn-primary w-full">Submit</button>
        {submitted && (
          <div className="rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
            <p className="text-sm text-[var(--text-primary)] font-medium">Submitted successfully!</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Full address: {[fullName, villageQuery, selectedAddress?.hierarchy?.subDistrict, selectedAddress?.hierarchy?.district, selectedAddress?.hierarchy?.state, selectedAddress?.hierarchy?.country ?? 'India'].filter(Boolean).join(', ')}</p>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--background-secondary)] border border-[var(--border)] p-2 text-xs font-mono">{JSON.stringify({ fullName, email, phone, address: selectedAddress?.hierarchy ?? null, fullAddress: selectedAddress?.fullAddress ?? null, message }, null, 2)}</pre>
          </div>
        )}
      </form>
    </div>
  );
}

export default function DemoClientPage() {
  const [demoTab, setDemoTab] = useState<'contact' | 'explorer'>('contact');
  const [mode, setMode] = useState<'search' | 'autocomplete'>('search');
  const [q, setQ] = useState('');
  const [hierarchyLevel, setHierarchyLevel] = useState('');
  const [limit, setLimit] = useState('25');

  // Real-time autocomplete for Search Query
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [suggestionHighlighted, setSuggestionHighlighted] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);

  // Cascading selections — shared for Search and Autocomplete to reuse backend data
  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedStateName, setSelectedStateName] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDistrictName, setSelectedDistrictName] = useState('');
  const [selectedSubDistrictId, setSelectedSubDistrictId] = useState('');
  const [selectedSubDistrictName, setSelectedSubDistrictName] = useState('');

  const [submitted, setSubmitted] = useState<{ q: string; state: string; district: string; subDistrict: string; limit: string; hierarchyLevel: string } | null>(null);

  // ---- Real-time autocomplete for Search Query (debounce 250ms) ----
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    // reset highlight when debounced query changes
    setSuggestionHighlighted(-1);
  }, [debouncedQ]);

  // Click outside to close search suggestions
  useEffect(() => {
    if (!isSearchFocused) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchFocused]);

  // Scroll highlighted suggestion into view
  useEffect(() => {
    if (suggestionHighlighted < 0 || !suggestionListRef.current) return;
    const el = suggestionListRef.current.querySelector(`[data-suggestion-index="${suggestionHighlighted}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [suggestionHighlighted]);

  // Fetch suggestions for Search Query — reuse existing /v1/autocomplete endpoint (debounce 250ms, allow single char)
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['search-query-suggestions', debouncedQ, selectedStateName, selectedDistrictName, selectedSubDistrictName, mode, hierarchyLevel],
    queryFn: async () => {
      const trimmed = debouncedQ.trim();
      if (trimmed.length < 1) return { success: true, count: 0, data: [] as SearchItem[], meta: { requestId: '', responseTime: 0 } } as unknown as ApiResponse<SearchItem[]>;
      const params = new URLSearchParams({ q: trimmed });
      // For Search mode, suggest villages (hierarchyLevel=village); for Autocomplete mode, respect selected hierarchyLevel
      if (mode === 'search') {
        params.set('hierarchyLevel', 'village');
      } else {
        params.set('hierarchyLevel', hierarchyLevel || 'village');
      }
      if (selectedStateName) params.set('state', selectedStateName);
      if (selectedDistrictName) params.set('district', selectedDistrictName);
      if (selectedSubDistrictName) params.set('subDistrict', selectedSubDistrictName);
      try {
        return await apiFetch<ApiResponse<SearchItem[]>>(`/v1/autocomplete?${params.toString()}`);
      } catch (e: any) {
        // Backend returns 400 for q too short or no results — treat as empty (allows single char typing "M")
        if (String(e?.message).toLowerCase().includes('too short') || String(e?.message).includes('400') || String(e?.message).includes('does not exist') || String(e?.message).includes('INVALID_QUERY')) {
          return { success: true, count: 0, data: [] as SearchItem[], meta: { requestId: '', responseTime: 0 } } as unknown as ApiResponse<SearchItem[]>;
        }
        throw e;
      }
    },
    enabled: debouncedQ.trim().length >= 1 && isSearchFocused,
    retry: false,
    staleTime: 30_000,
  });
  const suggestions: SearchItem[] = suggestionsData?.data ?? [];
  const showSuggestionsDropdown = isSearchFocused && q.trim().length >= 1 && (suggestionsLoading || suggestions.length > 0 || (!suggestionsLoading && debouncedQ.trim().length >= 1 && suggestions.length === 0));

  const handleSelectSuggestion = (item: SearchItem) => {
    // Put value into Search Query — use village/state name from hierarchy or label
    const val = item.hierarchy?.village || item.hierarchy?.subDistrict || item.hierarchy?.district || item.hierarchy?.state || item.label?.split(' (')[0] || item.label;
    setQ(val);
    setIsSearchFocused(false);
    setSuggestionHighlighted(-1);
  };

  // ---- Data fetching for cascading ----
  const { data: statesData, isLoading: statesLoading } = useQuery({
    queryKey: ['states'],
    queryFn: () => apiFetch<ApiResponse<Option[]>>('/v1/states'),
  });
  const states: Option[] = statesData?.data ?? [];

  const { data: districtsData, isLoading: districtsLoading } = useQuery({
    queryKey: ['districts', selectedStateId],
    queryFn: async () => {
      try {
        return await apiFetch<ApiResponse<Option[]>>(`/v1/states/${selectedStateId}/districts`);
      } catch (e: any) {
        // Backend returns 404 when no districts; treat as empty rather than error
        if (String(e?.message)?.includes('does not exist') || String(e?.message)?.includes('404')) {
          return { success: true, count: 0, data: [], meta: { requestId: '', responseTime: 0 } } as ApiResponse<Option[]>;
        }
        throw e;
      }
    },
    enabled: !!selectedStateId,
    retry: false,
  });
  const districts: Option[] = districtsData?.data ?? [];

  const { data: subDistrictsData, isLoading: subDistrictsLoading } = useQuery({
    queryKey: ['subdistricts', selectedDistrictId],
    queryFn: async () => {
      try {
        return await apiFetch<ApiResponse<Option[]>>(`/v1/districts/${selectedDistrictId}/subdistricts`);
      } catch (e: any) {
        if (String(e?.message)?.includes('does not exist') || String(e?.message)?.includes('404')) {
          return { success: true, count: 0, data: [], meta: { requestId: '', responseTime: 0 } } as ApiResponse<Option[]>;
        }
        throw e;
      }
    },
    enabled: !!selectedDistrictId,
    retry: false,
  });
  const subDistricts: Option[] = subDistrictsData?.data ?? [];

  // ---- Cascading handlers (used by custom searchable dropdown) ----
  const handleStateChange = (id: string, label: string) => {
    setSelectedStateId(id);
    setSelectedStateName(label);
    // cascading clear
    setSelectedDistrictId('');
    setSelectedDistrictName('');
    setSelectedSubDistrictId('');
    setSelectedSubDistrictName('');
  };

  const handleDistrictChange = (id: string, label: string) => {
    setSelectedDistrictId(id);
    setSelectedDistrictName(label);
    setSelectedSubDistrictId('');
    setSelectedSubDistrictName('');
  };

  const handleSubDistrictChange = (id: string, label: string) => {
    setSelectedSubDistrictId(id);
    setSelectedSubDistrictName(label);
  };

  const handleHierarchyLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setHierarchyLevel(val);
    // When hierarchy changes, keep cascading but it will conditionally hide/show.
    // If switching to a higher level, clear deeper selections that are no longer relevant
    if (val === 'state') {
      setSelectedDistrictId('');
      setSelectedDistrictName('');
      setSelectedSubDistrictId('');
      setSelectedSubDistrictName('');
    } else if (val === 'district') {
      setSelectedSubDistrictId('');
      setSelectedSubDistrictName('');
    }
    // village and '' keep full cascade
  };

  const handleModeSwitch = (m: 'search' | 'autocomplete') => {
    setMode(m);
    setSubmitted(null);
  };

  const params: Record<string, string> = {};
  if (submitted) {
    params.q = submitted.q;
    if (submitted.state) params.state = submitted.state;
    if (submitted.district) params.district = submitted.district;
    if (submitted.subDistrict) params.subDistrict = submitted.subDistrict;
    if (submitted.limit) params.limit = submitted.limit;
    if (submitted.hierarchyLevel) params.hierarchyLevel = submitted.hierarchyLevel;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['demo', mode, submitted],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString();
      return mode === 'search' ? apiFetch<ApiResponse<SearchItem[]>>(`/v1/search?${qs}`) : apiFetch<ApiResponse<SearchItem[]>>(`/v1/autocomplete?${qs}`);
    },
    enabled: !!submitted
  });

  const handleSearch = () => {
    if (q.length < 2) return;
    if (mode === 'search') {
      setSubmitted({ q, state: selectedStateName, district: selectedDistrictName, subDistrict: selectedSubDistrictName, limit, hierarchyLevel: '' });
    } else {
      // Autocomplete: send hierarchyLevel + parent filters for village level
      // For state/district/subDistrict levels, parent filters are sent as well for contextual search
      setSubmitted({ q, state: selectedStateName, district: selectedDistrictName, subDistrict: selectedSubDistrictName, limit: '', hierarchyLevel });
    }
  };

  const responseJson = data ? JSON.stringify(data, null, 2) : null;
  const errJson = error ? JSON.stringify((error as any)?.data ?? (error as any)?.message ?? 'Request failed', null, 2) : null;

  // Helpers to render dropdown states — custom searchable dropdown (matches dark theme, cyan accent)
  const renderStateDropdown = (disabledOverride = false) => (
    <SearchableDropdown
      label="State"
      options={states}
      value={selectedStateId}
      onChange={handleStateChange}
      placeholder={statesLoading ? 'Loading states...' : 'Select State'}
      searchPlaceholder="Search state..."
      disabled={disabledOverride}
      loading={statesLoading}
      emptyText="No states found"
    />
  );

  const renderDistrictDropdown = () => (
    <SearchableDropdown
      label="District"
      options={districts}
      value={selectedDistrictId}
      onChange={handleDistrictChange}
      placeholder="Select District"
      searchPlaceholder="Search district..."
      disabled={!selectedStateId}
      loading={districtsLoading}
      emptyText={!selectedStateId ? 'Select a state first' : 'No districts found for this state'}
    />
  );

  const renderSubDistrictDropdown = () => (
    <SearchableDropdown
      label="Sub-District"
      options={subDistricts}
      value={selectedSubDistrictId}
      onChange={handleSubDistrictChange}
      placeholder="Select Sub-District"
      searchPlaceholder="Search sub-district..."
      disabled={!selectedDistrictId}
      loading={subDistrictsLoading}
      emptyText={!selectedDistrictId ? 'Select a district first' : 'No sub-districts found for this district'}
    />
  );

  return (
    <>
      <SectionTitle eyebrow="Try It" title="Live Demo Client" description="Spec 13 — Demonstration of API integration: contact form with autocomplete + API explorer." />

      <div className="mb-5 flex gap-2">
        <button onClick={() => setDemoTab('contact')} className={`rounded-[7px] px-4 py-2 text-sm font-medium border transition-colors ${demoTab === 'contact' ? 'tab-active border-transparent' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)]'}`}>Contact Form Demo</button>
        <button onClick={() => setDemoTab('explorer')} className={`rounded-[7px] px-4 py-2 text-sm font-medium border transition-colors ${demoTab === 'explorer' ? 'tab-active border-transparent' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)]'}`}>API Explorer</button>
      </div>

      {demoTab === 'contact' && (
        <div className="mb-6 animate-fade-in">
          <ContactFormDemo />
          <p className="mt-3 text-xs text-[var(--text-muted)] text-center">Demo uses <span className="font-mono text-[var(--accent)]">VITE_API_KEY</span> (restricted, public) — see .env.example</p>
        </div>
      )}

      {demoTab === 'explorer' && <></>}
      <div className={demoTab === 'contact' ? 'hidden' : 'block'}>
      <div className="mb-4 rounded-[7px] border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 text-xs text-[var(--text-muted)]">API Explorer — Execute real API calls and inspect responses.</div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="editorial-card p-5 h-fit">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--text-muted)]">Input</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="flex gap-2 mt-3 mb-5">
            {(['search', 'autocomplete'] as const).map(m => (
              <button key={m} onClick={() => handleModeSwitch(m)} className={`rounded-[7px] px-3.5 py-2 text-sm font-medium border transition-colors duration-200 ${mode === m ? 'tab-active border-transparent' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:border-[var(--border-hover)]'}`}>
                {m === 'search' ? 'Search' : 'Autocomplete'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* Search Query with real-time autocomplete — dropdown opens DOWNWARD, same width, dark theme, high z-index */}
            <div ref={searchContainerRef} className="relative">
              <label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Search Query *</label>
              <div className="relative">
                <input
                  value={q}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={e => {
                    setQ(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={e => {
                    if (showSuggestionsDropdown && suggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSuggestionHighlighted(prev => (prev + 1) % suggestions.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSuggestionHighlighted(prev => (prev - 1 + suggestions.length) % suggestions.length);
                      } else if (e.key === 'Enter') {
                        if (suggestionHighlighted >= 0 && suggestions[suggestionHighlighted]) {
                          e.preventDefault();
                          handleSelectSuggestion(suggestions[suggestionHighlighted]);
                        } else {
                          handleSearch();
                        }
                      } else if (e.key === 'Escape') {
                        setIsSearchFocused(false);
                        setSuggestionHighlighted(-1);
                      }
                    } else {
                      if (e.key === 'Enter') handleSearch();
                      if (e.key === 'Escape') setIsSearchFocused(false);
                    }
                  }}
                  placeholder={mode === 'search' ? 'e.g. Mani, Maharashtra' : 'Type to get suggestions…'}
                  className="input-field pr-9"
                />
                {/* Small loading indicator inside input when fetching */}
                {suggestionsLoading && q.trim().length >= 1 && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                  </span>
                )}
              </div>

              {/* Autocomplete dropdown — directly below input, same width, high z-index above State/District */}
              {showSuggestionsDropdown && (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_32px_rgba(0,0,0,0.45),0_4px_12px_rgba(0,0,0,0.25)]"
                  style={{ animation: 'dropdownIn 180ms ease-out' }}
                  onMouseDown={e => e.preventDefault()}
                >
                  <div
                    ref={suggestionListRef}
                    role="listbox"
                    className="max-h-[260px] overflow-y-auto overscroll-contain py-1"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {suggestionsLoading ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-muted)]">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                        Searching...
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No results found</div>
                    ) : (
                      suggestions.map((item, idx) => {
                        const isHighlighted = idx === suggestionHighlighted;
                        const isSelected = q === (item.hierarchy?.village || item.hierarchy?.state || item.label);
                        return (
                          <button
                            key={`${item.value}-${idx}`}
                            type="button"
                            role="option"
                            aria-selected={isHighlighted}
                            data-suggestion-index={idx}
                            onMouseEnter={() => setSuggestionHighlighted(idx)}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleSelectSuggestion(item)}
                            className={`flex w-full flex-col items-start px-3 py-[9px] text-left transition-colors
                              ${isHighlighted
                                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                                : isSelected
                                  ? 'bg-[var(--card-hover)] text-[var(--text-primary)]'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)]'
                              }`}
                          >
                            <span className={`text-sm leading-tight ${isHighlighted ? 'text-[var(--accent-ink)] font-medium' : ''}`}>
                              {item.hierarchy?.village || item.hierarchy?.state || item.hierarchy?.district || item.hierarchy?.subDistrict || item.label}
                            </span>
                            {item.fullAddress && (
                              <span className="mt-0.5 line-clamp-1 text-xs text-[var(--text-muted)]">{item.fullAddress}</span>
                            )}
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
                      {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} • press ↑↓ to navigate, Enter to select, Esc to close
                    </div>
                  )}
                </div>
              )}
            </div>

            {mode === 'search' && (
              <>
                {renderStateDropdown()}
                {renderDistrictDropdown()}
                {renderSubDistrictDropdown()}
                <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Limit</label>
                  <select value={limit} onChange={e => setLimit(e.target.value)} className="select-field w-28"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select>
                </div>
              </>
            )}

            {mode === 'autocomplete' && (
              <>
                <div><label style={{ fontFamily: 'var(--font-mono)' }} className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Hierarchy Level</label>
                  <select value={hierarchyLevel} onChange={handleHierarchyLevelChange} className="select-field w-full"><option value="">All Levels</option><option value="village">Village</option><option value="subDistrict">Sub-District</option><option value="district">District</option><option value="state">State</option></select>
                </div>

                {/* Cascading hierarchy for autocomplete — consistent with Search tab */}
                {/* State is shown for all levels except when hierarchy is empty and user hasn't started, but we keep it visible for consistency */}
                {/* Conditional rendering per spec: show only relevant level dropdowns */}
                {hierarchyLevel === 'state' && (
                  <>{renderStateDropdown()}</>
                )}
                {hierarchyLevel === 'district' && (
                  <>
                    {renderStateDropdown()}
                    {renderDistrictDropdown()}
                  </>
                )}
                {hierarchyLevel === 'subDistrict' && (
                  <>
                    {renderStateDropdown()}
                    {renderDistrictDropdown()}
                    {renderSubDistrictDropdown()}
                  </>
                )}
                {(hierarchyLevel === 'village' || hierarchyLevel === '') && (
                  <>
                    {renderStateDropdown()}
                    {renderDistrictDropdown()}
                    {renderSubDistrictDropdown()}
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">Select State → District → Sub-District to narrow village results, or leave empty to search all villages.</p>
                  </>
                )}
              </>
            )}
            <button onClick={handleSearch} disabled={q.length < 2 || isLoading} className="btn-primary w-full mt-1">{isLoading ? 'Executing…' : `Execute ${mode === 'search' ? 'Search' : 'Autocomplete'}`}</button>
            {mode === 'search' && (selectedStateName || selectedDistrictName || selectedSubDistrictName) && (
              <p className="text-xs text-[var(--text-muted)]">Filters: {[selectedStateName, selectedDistrictName, selectedSubDistrictName].filter(Boolean).join(' → ') || 'None'}</p>
            )}
            {mode === 'autocomplete' && hierarchyLevel && (
              <p className="text-xs text-[var(--text-muted)]">Level: {hierarchyLevel} {selectedStateName ? `• ${[selectedStateName, selectedDistrictName, selectedSubDistrictName].filter(Boolean).join(' → ')}` : ''}</p>
            )}
          </div>
        </div>

        <div className="editorial-card p-5 h-fit">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--text-muted)]">Response</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
            {!submitted && !error && <span className="text-xs text-[var(--text-muted)]">Run a query</span>}
          </div>

          <div className="mt-4">
            {isLoading ? <div className="flex items-center justify-center py-12"><LoadingSpinner /></div>
              : errJson ? (
                <div className="rounded-[7px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4">
                  <p style={{ fontFamily: 'var(--font-mono)' }} className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--danger)]">Error</p>
                  <pre className="overflow-x-auto text-xs text-[var(--danger)] font-mono leading-relaxed whitespace-pre-wrap">{errJson}</pre>
                </div>
              ) : responseJson ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-emerald text-[11px]">{data!.success ? 'Success' : 'Error'}</span>
                    {data!.count !== undefined && <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)]">{data!.count} results</span>}
                    {data!.meta?.responseTime && <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)]">{data!.meta.responseTime}ms</span>}
                  </div>
                  <pre className="max-h-[480px] overflow-auto rounded-[7px] bg-[var(--background-secondary)] border border-[var(--border)] p-4 text-xs text-[var(--text-primary)] leading-relaxed">{responseJson}</pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-[var(--border)] rounded-[7px] bg-[var(--background-secondary)]">
                  <p style={{ fontFamily: 'var(--font-mono)' }} className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">No results yet</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Try “Mani” or “Akkalkuwa”</p>
                </div>
              )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
