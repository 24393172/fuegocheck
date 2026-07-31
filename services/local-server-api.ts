import { ExtinguisherRecord } from '../types/extinguisher.types';
import { HydrantRecord } from '../types/hydrant.types';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Photo } from '../types/inspection.types';
import { AlarmAnswer, AlarmDeviceItem, AlarmFormStatus } from '../types/alarm.types';
import { AnsulAnswer, AnsulFormStatus } from '../types/ansul.types';

const REQUEST_TIMEOUT_MS = 7000;

export interface ExtinguisherSyncPayload {
  inspectionId: string;
  company: { id: string | null; name: string };
  branch?: { id: string | null; name: string } | null;
  date: string;
  technician: { id: string | null; name: string };
  extinguishers: ExtinguisherRecord[];
  sourceDeviceId?: string;
  syncVersion: number;
}

export interface HydrantSyncPayload {
  inspectionId: string;
  company: { id: string | null; name: string };
  branch?: { id: string | null; name: string } | null;
  date: string;
  technician: { id: string | null; name: string };
  hydrants: HydrantRecord[];
  sourceDeviceId?: string;
  syncVersion: number;
}

export interface InspectionSyncPayload extends Omit<ExtinguisherSyncPayload, 'extinguishers'> {
  attention: string;
  area: string;
  selectedFormatIds: string[];
  extinguishers?: ExtinguisherRecord[];
  hydrants?: HydrantRecord[];
  firePumps?: Array<{
    formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel';
    status: 'not_started' | 'in_progress' | 'complete' | 'not_applicable';
    observations: string;
    updatedAt: number;
    answers: Array<{
      questionId: string;
      answer?: 'si' | 'no' | 'na';
      parameter?: string | number;
      reading?: string | number;
      comment?: string;
    }>;
  }>;
  alarms?: {
    systemName: string;
    systemNameDiscrepancies: Array<{ source: string; value: string }>;
    panel: {
      formType: 'alarm_panel';
      status: AlarmFormStatus;
      observations: string;
      updatedAt: number;
      answers: AlarmAnswer[];
    };
    addressedDevices: {
      formType: 'addressed_devices';
      status: AlarmFormStatus;
      items: AlarmDeviceItem[];
      observations: string;
      updatedAt: number;
    };
    conventionalDevices: {
      formType: 'conventional_devices';
      status: AlarmFormStatus;
      items: AlarmDeviceItem[];
      observations: string;
      updatedAt: number;
    };
    notificationDevices: {
      formType: 'notification_devices';
      status: AlarmFormStatus;
      items: AlarmDeviceItem[];
      observations: string;
      updatedAt: number;
    };
  };
  ansul?: {
    formType: 'ansul_r102';
    status: AnsulFormStatus;
    systemName: string;
    capacityGallons: string;
    observations: string;
    normalizationIssues: Array<{ source: string; questionId?: string; message: string }>;
    updatedAt: number;
    answers: AnsulAnswer[];
  };
  signature?: {
    mimeType: 'image/png';
    dataBase64: string;
    signedAt: string;
    signerName: string;
  } | null;
  evidenceManifest?: Array<{
    evidenceId: string; formatType: string; formType: string | null; itemId: string | null; fieldKey: string;
    caption: string | null; locationNameSnapshot: string | null; capturedAt: string; updatedAt: string;
  }>;
}

type ExtinguisherServerRecord = Omit<
  ExtinguisherRecord,
  'locationId' | 'locationNameSnapshot' | 'customLocation'
>;

export interface HealthResponse {
  ok: true;
  service: 'ExtinCheck Local Server';
  version: string;
  timestamp: string;
}

export type LocalServerDiagnosticKind =
  | 'ok'
  | 'configuration'
  | 'network'
  | 'timeout'
  | 'http_401'
  | 'http_403'
  | 'http_422'
  | 'http_500'
  | 'http_other'
  | 'invalid_response';

export interface LocalServerDiagnosticCheck {
  ok: boolean;
  kind: LocalServerDiagnosticKind;
  status: number | null;
  detail: string;
}

export interface LocalServerDiagnostics {
  serverUrl: string;
  apiKeyConfigured: boolean;
  health: LocalServerDiagnosticCheck;
  catalog: LocalServerDiagnosticCheck;
}

export interface SyncResponse {
  ok: true;
  created: boolean;
  inspectionId: string;
  extinguishersReceived?: number;
  hydrantsReceived?: number;
  syncedAt: string;
  syncedFormatIds?: string[];
  unsupportedFormatIds?: string[];
  syncStatus?: 'partial' | 'synced';
  evidencePending?: number;
  missingEvidenceIds?: string[];
  report: {
    id: string;
    filename: string;
    downloadUrl: string;
    generatedAt: string;
  } | null;
}

export interface EvidenceFinalizeResponse {
  ok: true;
  evidenceCount: number;
  report: NonNullable<SyncResponse['report']>;
}

export function syncInspection(payload: InspectionSyncPayload): Promise<SyncResponse> {
  const serverPayload = {
    ...payload,
    extinguishers: payload.extinguishers?.map(toExtinguisherServerRecord),
    hydrants: payload.hydrants?.map(toHydrantServerRecord),
  };
  return requestLocalServer<SyncResponse>('/api/inspections/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serverPayload),
  });
}

export async function uploadInspectionEvidence(photo: Photo): Promise<{ id: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const form = new FormData();
    form.append('inspectionId', photo.inspection_id);
    form.append('metadata', JSON.stringify({
      evidenceId: photo.id, formatType: photo.format_type, formType: photo.form_type, itemId: photo.item_id,
      fieldKey: photo.field_key, caption: photo.caption,
      locationNameSnapshot: photo.location_name_snapshot,
      capturedAt: new Date(photo.created_at).toISOString(), updatedAt: new Date(photo.updated_at).toISOString(),
    }));
    form.append('file', new File(photo.local_uri));
    if (photo.thumbnail_uri) form.append('thumbnail', new File(photo.thumbnail_uri));
    const response = await expoFetch(`${getLocalServerUrl()}/api/inspections/${encodeURIComponent(photo.inspection_id)}/evidence`, {
      method: 'POST', body: form, signal: controller.signal,
      headers: authorizedHeaders(),
    });
    const body = await response.json().catch(() => null) as { message?: string; evidence?: { id: string } } | null;
    if (!response.ok || !body?.evidence?.id) throw new LocalServerApiError(
      body?.message || `No se pudo subir la evidencia (HTTP ${response.status})`, response.status,
      response.status >= 400 && response.status < 500 ? 'VALIDATION' : 'SERVER'
    );
    return body.evidence;
  } catch (error) {
    if (error instanceof LocalServerApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new LocalServerApiError('La carga de la evidencia agotó el tiempo de espera', 0, 'TIMEOUT');
    throw new LocalServerApiError(error instanceof Error ? error.message : 'No se pudo subir la evidencia', 0, 'NETWORK');
  } finally { clearTimeout(timeout); }
}

export function deleteInspectionEvidence(inspectionId: string, evidenceId: string): Promise<{ ok: true }> {
  return requestLocalServer(`/api/inspections/${encodeURIComponent(inspectionId)}/evidence/${encodeURIComponent(evidenceId)}`, { method: 'DELETE' });
}

export function finalizeInspectionEvidence(inspectionId: string, evidenceIds: string[]): Promise<EvidenceFinalizeResponse> {
  return requestLocalServer(`/api/inspections/${encodeURIComponent(inspectionId)}/evidence/finalize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceIds }),
  });
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

export function getLocalServerUrl(): string {
  const configured = process.env.EXPO_PUBLIC_LOCAL_SERVER_URL?.trim().replace(/\/$/, '');
  if (!configured) {
    throw new LocalServerApiError(
      'El acceso al servidor local no está configurado en este dispositivo.',
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
      'El acceso al servidor local no está configurado en este dispositivo.',
      0,
      'CONFIGURATION'
    );
  }
  return configured;
}

export function getLocalApiKey(): string {
  const configured = process.env.EXPO_PUBLIC_LOCAL_API_KEY?.trim();
  if (!configured) {
    throw new LocalServerApiError(
      'El acceso al servidor local no está configurado en este dispositivo.',
      0,
      'CONFIGURATION'
    );
  }
  return configured;
}

export function hasLocalApiKey(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_LOCAL_API_KEY?.trim());
}

function requestHeaders(initial: HeadersInit | undefined, authenticated: boolean) {
  const headers = new Headers(initial);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (authenticated) headers.set('Authorization', `Bearer ${getLocalApiKey()}`);
  return headers;
}

function authorizedHeaders(initial?: HeadersInit) {
  return requestHeaders(initial, true);
}

export async function requestLocalServer<T>(
  path: string,
  init?: RequestInit,
  options: { authenticated?: boolean } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getLocalServerUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: requestHeaders(init?.headers, options.authenticated !== false),
    });
    const body = await response.json().catch(() => null) as {
      message?: string;
      issues?: Array<{ path?: string; message?: string }>;
    } | null;
    if (!response.ok) {
      const issueDetails = body?.issues
        ?.slice(0, 3)
        .map((issue) => [issue.path, issue.message].filter(Boolean).join(': '))
        .filter(Boolean)
        .join('; ');
      throw new LocalServerApiError(
        [body?.message || `Local server returned HTTP ${response.status}`, issueDetails]
          .filter(Boolean)
          .join(' — '),
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

export async function downloadOfficialReport(downloadUrl: string, reportId: string, inspectionId: string): Promise<string> {
  const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const downloadMatch = new RegExp(
    `^/api/mobile/inspections/([^/]+)/reports/(${uuidPattern})/download$`,
    'i'
  ).exec(downloadUrl);
  if (!downloadMatch || !new RegExp(`^${uuidPattern}$`, 'i').test(reportId)
      || decodeURIComponent(downloadMatch[1]) !== inspectionId
      || downloadMatch[2].toLowerCase() !== reportId.toLowerCase()) {
    throw new LocalServerApiError('Invalid official report reference', 0, 'VALIDATION');
  }
  const shortInspectionId = inspectionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8);
  const target = new File(Paths.document, `reporte_oficial_${shortInspectionId}_${reportId}.xlsx`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await expoFetch(`${getLocalServerUrl()}${downloadUrl}`, {
      headers: authorizedHeaders({
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new LocalServerApiError(`No se pudo descargar el reporte oficial (HTTP ${response.status})`, response.status, 'SERVER');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new LocalServerApiError('El servidor devolvió un archivo de reporte inválido', 0, 'SERVER');
    }
    if (target.exists) target.delete();
    target.create({ overwrite: true });
    target.write(bytes);
    if (!target.exists || !target.size) throw new LocalServerApiError('El reporte descargado está vacío', 0, 'SERVER');
    return target.uri;
  } catch (error) {
    if (target.exists) target.delete();
    if (error instanceof LocalServerApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LocalServerApiError('La descarga del reporte oficial agotó el tiempo de espera', 0, 'TIMEOUT');
    }
    throw new LocalServerApiError(
      error instanceof Error ? error.message : 'No se pudo descargar el reporte oficial', 0, 'NETWORK'
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
  const response = await requestLocalServer<HealthResponse>(
    '/api/health',
    undefined,
    { authenticated: false }
  );
  if (!response.ok || response.service !== 'ExtinCheck Local Server') {
    throw new LocalServerApiError('Unexpected health response', 0, 'SERVER');
  }
  return response;
}

function diagnosticHttpResult(status: number): LocalServerDiagnosticCheck {
  const knownStatuses: Partial<Record<number, [LocalServerDiagnosticKind, string]>> = {
    401: ['http_401', 'HTTP 401 · La clave no fue aceptada'],
    403: ['http_403', 'HTTP 403 · Acceso prohibido'],
    422: ['http_422', 'HTTP 422 · Solicitud rechazada por validación'],
    500: ['http_500', 'HTTP 500 · Error interno del servidor'],
  };
  const known = knownStatuses[status];
  if (known) {
    return { ok: false, kind: known[0], status, detail: known[1] };
  }
  if (status >= 500) {
    return {
      ok: false,
      kind: 'http_500',
      status,
      detail: `HTTP ${status} · Error del servidor`,
    };
  }
  return {
    ok: false,
    kind: 'http_other',
    status,
    detail: `HTTP ${status} · Respuesta no satisfactoria`,
  };
}

async function runDiagnosticRequest(
  serverUrl: string,
  path: string,
  authenticated: boolean,
  isExpectedBody: (body: unknown) => boolean
): Promise<LocalServerDiagnosticCheck> {
  if (authenticated && !hasLocalApiKey()) {
    return {
      ok: false,
      kind: 'configuration',
      status: null,
      detail: 'Clave API no configurada',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (authenticated) {
      headers.set('Authorization', `Bearer ${getLocalApiKey()}`);
    }
    const response = await fetch(`${serverUrl}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!response.ok) return diagnosticHttpResult(response.status);

    const body = await response.json().catch(() => null) as unknown;
    if (!isExpectedBody(body)) {
      return {
        ok: false,
        kind: 'invalid_response',
        status: response.status,
        detail: `HTTP ${response.status} · Respuesta inesperada`,
      };
    }
    return {
      ok: true,
      kind: 'ok',
      status: response.status,
      detail: `HTTP ${response.status} · Correcto`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        kind: 'timeout',
        status: null,
        detail: 'Timeout · El servidor tardó demasiado',
      };
    }
    return {
      ok: false,
      kind: 'network',
      status: null,
      detail: 'Error de red · No se pudo llegar al servidor',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLocalServerDiagnostics(): Promise<LocalServerDiagnostics> {
  const apiKeyConfigured = hasLocalApiKey();
  let serverUrl: string;
  try {
    serverUrl = getLocalServerUrl();
  } catch {
    const configurationResult: LocalServerDiagnosticCheck = {
      ok: false,
      kind: 'configuration',
      status: null,
      detail: 'URL del servidor no configurada',
    };
    return {
      serverUrl: 'No configurado',
      apiKeyConfigured,
      health: configurationResult,
      catalog: configurationResult,
    };
  }

  const [health, catalog] = await Promise.all([
    runDiagnosticRequest(serverUrl, '/api/health', false, (body) => {
      const value = body as Partial<HealthResponse> | null;
      return value?.ok === true && value.service === 'ExtinCheck Local Server';
    }),
    runDiagnosticRequest(serverUrl, '/api/mobile/catalog', true, (body) => {
      const value = body as { version?: unknown; companies?: unknown } | null;
      return typeof value?.version === 'string' && Array.isArray(value.companies);
    }),
  ]);

  return { serverUrl, apiKeyConfigured, health, catalog };
}

export function syncExtinguisherInspection(
  payload: ExtinguisherSyncPayload
): Promise<SyncResponse> {
  // The mobile record also contains catalog snapshot fields used offline.
  // Keep those fields in SQLite, but send only the server's strict API contract.
  const serverPayload = {
    ...payload,
    extinguishers: payload.extinguishers.map(toExtinguisherServerRecord),
  };
  return requestLocalServer<SyncResponse>('/api/inspections/extinguishers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serverPayload),
  });
}

export function syncHydrantInspection(payload: HydrantSyncPayload): Promise<SyncResponse> {
  const serverPayload = {
    ...payload,
    hydrants: payload.hydrants.map(toHydrantServerRecord),
  };
  return requestLocalServer<SyncResponse>('/api/inspections/hydrants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serverPayload),
  });
}

function toHydrantServerRecord(record: HydrantRecord) {
  return {
    id: record.id, numero: record.numero, locationId: record.locationId,
    locationNameSnapshot: record.locationNameSnapshot || record.ubicacion,
    customLocation: record.customLocation, gabinete: record.gabinete,
    gabinete_comentario: record.gabinete_comentario, senalamiento: record.senalamiento,
    senalamiento_comentario: record.senalamiento_comentario, calcomania: record.calcomania,
    calcomania_comentario: record.calcomania_comentario, valvula_angular: record.valvula_angular,
    valvula_angular_comentario: record.valvula_angular_comentario, manguera: record.manguera,
    manguera_comentario: record.manguera_comentario, chiflon: record.chiflon,
    chiflon_comentario: record.chiflon_comentario, llave_acople: record.llave_acople,
    llave_acople_comentario: record.llave_acople_comentario, observaciones: record.observaciones,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

export function toExtinguisherServerRecord(
  record: ExtinguisherRecord
): ExtinguisherServerRecord {
  return {
    id: record.id,
    numero: record.numero,
    ubicacion: record.ubicacion,
    tipo_extintor: record.tipo_extintor,
    capacidad: record.capacidad,
    proxima_recarga: record.proxima_recarga,
    presion: record.presion,
    presion_comentario: record.presion_comentario,
    altura: record.altura,
    altura_comentario: record.altura_comentario,
    seguro: record.seguro,
    seguro_comentario: record.seguro_comentario,
    pintura: record.pintura,
    pintura_comentario: record.pintura_comentario,
    manguera: record.manguera,
    manguera_comentario: record.manguera_comentario,
    difusor: record.difusor,
    difusor_comentario: record.difusor_comentario,
    senalamiento: record.senalamiento,
    senalamiento_comentario: record.senalamiento_comentario,
    observaciones: record.observaciones,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
