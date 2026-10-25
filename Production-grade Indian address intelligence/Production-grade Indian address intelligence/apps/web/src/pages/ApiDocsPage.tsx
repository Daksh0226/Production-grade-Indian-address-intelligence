import { useState } from 'react';
import { SectionTitle } from '../components/Layout';

const endpoints = [
  { method: 'GET', path: '/v1/search', desc: 'Search villages with hierarchy filters.', params: ['q (required, min 2 chars)', 'state (optional)', 'district (optional)', 'subDistrict (optional)', 'limit (1-100, default 25)'], auth: 'API Key', category: 'Search' },
  { method: 'GET', path: '/v1/autocomplete', desc: 'Typeahead suggestions for form fields.', params: ['q (required, min 2 chars)', 'hierarchyLevel (village|subDistrict|district|state)'], auth: 'API Key', category: 'Search' },
  { method: 'GET', path: '/v1/states', desc: 'List all Indian states.', params: [], auth: 'API Key', category: 'Hierarchy' },
  { method: 'GET', path: '/v1/states/:id/districts', desc: 'Districts within a state.', params: [], auth: 'API Key', category: 'Hierarchy' },
  { method: 'GET', path: '/v1/districts/:id/subdistricts', desc: 'Sub-districts within a district.', params: [], auth: 'API Key', category: 'Hierarchy' },
  { method: 'GET', path: '/v1/subdistricts/:id/villages', desc: 'Paginated villages within a sub-district.', params: ['page (default 1)', 'limit (default 500, max 10000)'], auth: 'API Key', category: 'Hierarchy' },
  { method: 'GET', path: '/v1/health', desc: 'Health check endpoint.', params: [], auth: 'None', category: 'System' },
  { method: 'POST', path: '/auth/login', desc: 'Authenticate and receive JWT token.', params: ['email (body)', 'password (body)'], auth: 'None', category: 'Auth' },
  { method: 'POST', path: '/auth/register', desc: 'Register a new business account.', params: ['email, password, businessName (body)', 'phoneNumber (optional)'], auth: 'None', category: 'Auth' },
];

const methodColors: Record<string, string> = { GET: 'badge-emerald', POST: 'badge-cyan', PUT: 'badge-amber', DELETE: 'badge-rose' };

const codeExamples: Record<string, { lang: string; code: string }[]> = {
  '/v1/search': [
    { lang: 'cURL', code: `curl -H "X-API-Key: YOUR_KEY" \\\n  "https://api.villageapi.com/v1/search?q=Mani&state=Maharashtra"` },
    { lang: 'Python', code: `import requests\n\nresp = requests.get(\n    "https://api.villageapi.com/v1/search",\n    params={"q": "Mani", "state": "Maharashtra"},\n    headers={"X-API-Key": "YOUR_KEY"}\n)\nfor item in resp.json()["data"]:\n    print(item["fullAddress"])` },
    { lang: 'JavaScript', code: `const res = await fetch(\n  "https://api.villageapi.com/v1/search?q=Mani&state=Maharashtra",\n  { headers: { "X-API-Key": "YOUR_KEY" } }\n);\nconst { data } = await res.json();` }
  ],
  '/v1/autocomplete': [
    { lang: 'cURL', code: `curl -H "X-API-Key: YOUR_KEY" \\\n  "https://api.villageapi.com/v1/autocomplete?q=Mani&hierarchyLevel=village"` },
    { lang: 'Python', code: `import requests\n\nresp = requests.get(\n    "https://api.villageapi.com/v1/autocomplete",\n    params={"q": "Mani", "hierarchyLevel": "village"},\n    headers={"X-API-Key": "YOUR_KEY"}\n)` },
    { lang: 'JavaScript', code: `const res = await fetch(\n  "https://api.villageapi.com/v1/autocomplete?q=Mani",\n  { headers: { "X-API-Key": "YOUR_KEY" } }\n);` }
  ]
};

const responseExample = `{
  "success": true,
  "count": 25,
  "data": [{ "value": "village_id_525002", "label": "Manibeli", "fullAddress": "Manibeli, Akkalkuwa, Nandurbar, Maharashtra, India" }],
  "meta": { "requestId": "req_abc123", "responseTime": 47, "rateLimit": { "remaining": 4850, "limit": 5000 } }
}`;

export default function ApiDocsPage() {
  const [expanded, setExpanded] = useState<string | null>('/v1/search');
  const [selectedLang, setSelectedLang] = useState('cURL');
  const [searchFilter, setSearchFilter] = useState('');

  const filtered = endpoints.filter(e => !searchFilter || e.path.toLowerCase().includes(searchFilter.toLowerCase()) || e.desc.toLowerCase().includes(searchFilter.toLowerCase()));

  return (
    <>
      <SectionTitle eyebrow="Developers" title="API Documentation" description="Interactive reference with code examples in multiple languages. Restrained, editorial, and implementation-ready." />

      <div className="editorial-card p-5 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-7 h-7 rounded-[6px] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] text-xs">◆</div>
          <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[15px] font-semibold text-[var(--text-primary)]">Authentication</h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">All data endpoints require an API key. Pass it via headers:</p>
        <div className="rounded-[7px] bg-[var(--background-secondary)] border border-[var(--border)] p-4 font-mono text-xs overflow-x-auto leading-6">
          <div><span className="text-[var(--text-muted)]">X-API-Key:</span> <span className="text-[var(--accent)]">ak_your_api_key_here</span></div>
          <div><span className="text-[var(--text-muted)]">X-API-Secret:</span> <span className="text-[var(--accent-emerald)]">as_your_api_secret_here</span></div>
        </div>
      </div>

      <div className="mb-4">
        <input placeholder="Search endpoints…" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="input-field" />
      </div>

      <div className="space-y-3">
        {filtered.map(ep => {
          const isOpen = expanded === ep.path + ep.method;
          const examples = codeExamples[ep.path];
          return (
            <div key={ep.path + ep.method} className="editorial-card overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : ep.path + ep.method)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--card-hover)] transition-colors duration-200">
                <span className={`badge ${methodColors[ep.method] ?? 'badge-slate'} shrink-0 text-[11px]`}>{ep.method}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[13px] font-medium text-[var(--text-primary)]">{ep.path}</span>
                <span className="ml-auto hidden sm:block text-xs text-[var(--text-muted)]">{ep.desc}</span>
                <span className="text-[var(--text-muted)] text-xs w-4 text-center">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--border)] p-5">
                  <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">{ep.desc}</p>
                  <div className="flex gap-4 mb-4 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="text-[var(--text-muted)]">Auth: <span className="text-[var(--text-primary)]">{ep.auth}</span></span>
                    <span className="text-[var(--text-muted)]">Category: <span className="text-[var(--text-primary)]">{ep.category}</span></span>
                  </div>
                  {ep.params.length > 0 && (
                    <div className="mb-4">
                      <p style={{ fontFamily: 'var(--font-mono)' }} className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Parameters</p>
                      <div className="space-y-1.5">{ep.params.map(p => <div key={p} className="rounded-[6px] bg-[var(--background-secondary)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] font-mono">{p}</div>)}</div>
                    </div>
                  )}
                  <div className="mb-4">
                    <p style={{ fontFamily: 'var(--font-mono)' }} className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Response</p>
                    <pre className="rounded-[7px] bg-[var(--background-secondary)] border border-[var(--border)] p-4 text-xs text-[var(--text-secondary)] overflow-x-auto leading-relaxed">{responseExample}</pre>
                  </div>
                  {examples && (
                    <div>
                      <div className="flex gap-2 mb-3">
                        {examples.map(ex => (
                          <button key={ex.lang} onClick={() => setSelectedLang(ex.lang)} className={`rounded-[6px] px-3 py-1.5 text-xs font-medium border transition-colors duration-200 ${selectedLang === ex.lang ? 'tab-active border-transparent' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card)] border-[var(--border)]'}`}>{ex.lang}</button>
                        ))}
                      </div>
                      <pre className="rounded-[7px] bg-[var(--background)] border border-[var(--border)] p-4 text-xs text-[var(--text-primary)] overflow-x-auto leading-relaxed">{examples.find(e => e.lang === selectedLang)?.code}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
