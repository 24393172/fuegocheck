import { ExtinguisherRecord } from '../types/extinguisher.types';

const REQUEST_TIMEOUT_MS = 7000;

export interface ExtinguisherSyncPayload {
  inspectionId: string;
  company: { id: string | null; name: string };
  date: string;
  technician: { id: string | null; name: string };
  extinguishers: ExtinguisherRecord[];
  sourceDeviceId?: string;
  syncVersion: number;
}

export interface HealthResponse {
  ok: true;
  service: 'ExtinCheck Local Server';
  timestamp: string;
}

export interface SyncResponse {
  ok: true;
  created: boolean;
  inspectionId: string;
  extinguishersReceived: number;
  syncedAt: string;
}

export class LocalServerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: 'CONFIGURATION' | 'NETWORK' | 'TIMEOUT' | 'VALIDATION' | 'SERVER'
  ) {
    super(message);
    this.name = 'LocalServerApiError';
  }
}

function baseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_LOCAL_SERVER_URL?.trim().replace(/\/$/, '');
  if (!configured) {
    throw new LocalServerApiError(
      'EXPO_PUBLIC_LOCAL_SERVER_URL is not configured',
      0,
      'CONFIGURATION'
    );
  }
  try {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      throw new Error('A physical phone cannot use localhost');
    }
  } catch (error) {
    throw new LocalServerApiError(
      error instanceof Error ? error.message : 'Invalid local server URL',
      0,
      'CONFIGURATION'
    );
  }
  return configured;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) {
      throw new LocalServerApiError(
        body?.message || `Local server returned HTTP ${response.status}`,
        response.status,
        response.status === 400 ? 'VALIDATION' : 'SERVER'
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof LocalServerApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LocalServerApiError('Local server request timed out', 0, 'TIMEOUT');
    }
    throw new LocalServerApiError(
      error instanceof Error ? error.message : 'Local server is unavailable',
      0,
      'NETWORK'
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function inspectionDateToIso(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    throw new LocalServerApiError('Inspection date cannot be converted to YYYY-MM-DD', 0, 'VALIDATION');
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export async function checkServerHealth(): Promise<HealthResponse> {
  const response = await request<HealthResponse>('/api/health');
  if (!response.ok || response.service !== 'ExtinCheck Local Server') {
    throw new LocalServerApiError('Unexpected health response', 0, 'SERVER');
  }
  return response;
}

export function syncExtinguisherInspection(
  payload: ExtinguisherSyncPayload
): Promise<SyncResponse> {
  return request<SyncResponse>('/api/inspections/extinguishers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

