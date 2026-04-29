/**
 * Central HTTP client for the Studara API.
 *
 * All screens/contexts import from here.
 * Base URL can be overridden via Expo env:
 * - `EXPO_PUBLIC_API_BASE` (recommended)
 */

// Default to VPS IP in this migration workspace.
// You can override without rebuild using Expo env: EXPO_PUBLIC_API_BASE.
const DEFAULT_API_BASE = 'http://5.189.153.144/api/v1';
function normalizeApiBase(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (!s) return undefined;
  return s.replace(/\/+$/, '');
}

const EXPO_API_BASE =
  typeof process !== 'undefined'
    ? normalizeApiBase((process as any)?.env?.EXPO_PUBLIC_API_BASE)
    : undefined;

export const API_BASE = EXPO_API_BASE ?? DEFAULT_API_BASE;

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
      typeof data?.error === 'string'
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
      typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}
