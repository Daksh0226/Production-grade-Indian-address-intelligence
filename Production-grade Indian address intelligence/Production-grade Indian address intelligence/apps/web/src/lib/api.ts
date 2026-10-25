const rawBase = (import.meta.env.VITE_API_URL as string)?.trim() ?? '';
const API_BASE = rawBase ? rawBase.replace(/\/$/, '') : '';
const FALLBACK_BASE = 'http://localhost:3000';
const API_KEY = (import.meta.env.VITE_API_KEY as string) ?? '';

export { API_BASE, API_KEY };

// All frontend API calls go under /api so they never collide with SPA routes
// (/admin, /portal). The backend strips the /api prefix before routing.
function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}/api${p}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    if (!response.ok) throw new Error(`Request failed (${response.status} ${response.statusText})`);
    throw new Error('Empty response from server');
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
  if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
  return data as T;
}

async function doFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e: any) {
    // Network failure — e.g. "Failed to fetch" when backend is down or CORS blocked
    const target = url.startsWith('http') ? url : `${FALLBACK_BASE}${url}`;
    // If we used relative URL and it failed, retry with absolute fallback once
    if (!url.startsWith('http') && API_BASE === '') {
      try {
        return await fetch(target, init);
      } catch (e2: any) {
        throw new Error(`Cannot reach API at ${target}. Is the backend running on port 3000? (${e2?.message ?? e?.message})`);
      }
    }
    throw new Error(`Cannot reach API at ${url}. Is the backend running? (${e?.message ?? 'network error'})`);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(init?.headers)) };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const url = apiUrl(path);
  const response = await doFetch(url, { ...init, headers });
  return parseResponse<T>(response);
}

export async function authFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(init?.headers)) };
  const url = apiUrl(path);
  const response = await doFetch(url, { ...init, headers });
  return parseResponse<T>(response);
}
