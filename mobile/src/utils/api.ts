/**
 * Central HTTP client for the Studara API.
 *
 * All screens/contexts import from here.
 * Base URL can be overridden via Expo env:
 * - `EXPO_PUBLIC_API_BASE` (recommended)
 */

// Sensible default for builds where Expo env isn't injected.
// Prefer setting `EXPO_PUBLIC_API_BASE` explicitly for local/dev/staging.
const DEFAULT_API_BASE = 'https://api.radar-mr.com/api/v1';

function trimTrailingSlashes(input: string): string {
  return input.replace(/\/+$/, '');
}

function normalizeApiBase(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (!s) return undefined;
  return trimTrailingSlashes(s);
}

/**
 * Mobile paths are written as `/auth/...`, `/resources/...` (i.e. under `/api/v1`).
 * Many misconfigurations come from setting only the host (`https://api.example.com`)
 * or only `/api` — auto-fix those cases.
 */
function coerceJsonApiBase(base: string): string {
  const b = trimTrailingSlashes(base.trim());
  if (!b) return base;

  // Already canonical
  if (/\/api\/v\d+$/i.test(b)) return b;

  // Common partials
  if (/\/api$/i.test(b)) return `${b}/v1`;
  if (/\/api\/$/i.test(b)) return `${trimTrailingSlashes(b)}v1`;

  // Host-only / unknown path → assume Express mount used by this app
  try {
    const u = new URL(b.includes('://') ? b : `https://${b}`);
    if (!u.pathname || u.pathname === '/' || u.pathname === '') {
      u.pathname = '/api/v1';
      return trimTrailingSlashes(u.toString().replace(/\/+$/, ''));
    }
  } catch {
    // If URL parsing fails, fall back to suffixing best-effort.
  }

  return `${b}/api/v1`;
}

function serverOriginFromJsonApiBase(jsonApiBase: string): string {
  const b = trimTrailingSlashes(jsonApiBase);
  const stripped = b.replace(/\/api\/v\d+$/i, '');
  return stripped || b;
}

const EXPO_API_BASE_RAW =
  typeof process !== 'undefined' ? normalizeApiBase(process.env.EXPO_PUBLIC_API_BASE) : undefined;

export const API_BASE = coerceJsonApiBase(EXPO_API_BASE_RAW ?? DEFAULT_API_BASE);

/** Scheme + host (+ optional port) for building `/uploads/...` and `/api/v1/.../preview` URLs */
export const SERVER_ORIGIN = serverOriginFromJsonApiBase(API_BASE);

// ─── Typed helper ────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface FetchOptions {
  method?: HttpMethod;
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Thin wrapper around `fetch` for JSON requests that:
 * - Prepends API_BASE automatically
 * - Sets Content-Type + Authorization headers
 * - Throws with the server error message on non-2xx responses
 */
export async function apiRequest<T = unknown>(
  path: string,
  { method = 'GET', token, body, signal }: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const contentType = res.headers.get('content-type') || '';
  const hasJson = contentType.toLowerCase().includes('application/json');
  const data =
    res.status === 204
      ? {}
      : hasJson
        ? await res.json().catch(() => ({}))
        : await res.text().catch(() => '');

  if (!res.ok) {
    const msg =
      typeof data === 'string'
        ? data.trim().startsWith('<!') || data.trim().startsWith('<html')
          ? `HTTP ${res.status} — réponse HTML (souvent: mauvais port / mauvais service sur EXPO_PUBLIC_API_BASE). Base actuelle: ${API_BASE}`
          : data.length > 180
            ? `${data.slice(0, 180)}…`
            : data
        : typeof data?.error === 'string'
          ? data.error
          : data?.error?.fieldErrors
            ? Object.values(data.error.fieldErrors).flat().join(' — ')
            : `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}

/**
 * Multipart/FormData upload helper — bypasses JSON Content-Type.
 * Used for file upload endpoints (POST /resources, etc.).
 */
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const contentType = res.headers.get('content-type') || '';
  const hasJson = contentType.toLowerCase().includes('application/json');
  const data =
    res.status === 204
      ? {}
      : hasJson
        ? await res.json().catch(() => ({}))
        : await res.text().catch(() => '');

  if (!res.ok) {
    const msg =
      typeof data === 'string'
        ? data.trim().startsWith('<!') || data.trim().startsWith('<html')
          ? `HTTP ${res.status} — réponse HTML (souvent: mauvais port / mauvais service sur EXPO_PUBLIC_API_BASE). Base actuelle: ${API_BASE}`
          : data.length > 180
            ? `${data.slice(0, 180)}…`
            : data
        : typeof data?.error === 'string'
          ? data.error
          : `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}
