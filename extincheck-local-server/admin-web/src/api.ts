export class ApiError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null) as ({ message?: string } & T) | null;
  if (!response.ok) throw new ApiError(body?.message || `Error HTTP ${response.status}`);
  return body as T;
}

export function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && search.set(key, value));
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
