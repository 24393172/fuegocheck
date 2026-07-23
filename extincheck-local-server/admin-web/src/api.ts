export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AdminSession {
  username: string;
  expiresAt: string | null;
  csrfToken: string;
}

let csrfToken = '';
let unauthorizedHandler: (() => void) | null = null;

export function setAdminSession(session: AdminSession | null) {
  csrfToken = session?.csrfToken ?? '';
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (init?.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase()) && csrfToken) {
    headers.set('X-ExtinCheck-CSRF', csrfToken);
  }
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  const body = await response.json().catch(() => null) as ({ message?: string } & T) | null;
  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    throw new ApiError(body?.message || `Error HTTP ${response.status}`, response.status);
  }
  return body as T;
}

export async function getSession() {
  const result = await api<{ session: AdminSession }>('/api/admin/auth/session');
  setAdminSession(result.session);
  return result.session;
}

export async function login(username: string, password: string) {
  const result = await api<{ session: AdminSession }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAdminSession(result.session);
  return result.session;
}

export async function logout() {
  await api('/api/admin/auth/logout', { method: 'POST' });
  setAdminSession(null);
}

export function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && search.set(key, value));
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
