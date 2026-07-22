import { ExtinguisherRecord } from '../types/extinguisher.types';
import { HydrantRecord } from '../types/hydrant.types';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

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
  selectedFormatIds: string[];
  extinguishers?: ExtinguisherRecord[];
  hydrants?: HydrantRecord[];
  signature?: {
    mimeType: 'image/png';
    dataBase64: string;
    signedAt: string;
    signerName: string;
  } | null;
}

type ExtinguisherServerRecord = Omit<
  ExtinguisherRecord,
  'locationId' | 'locationNameSnapshot' | 'customLocation'
>;

export interface HealthResponse {
  ok: true;
  service: 'ExtinCheck Local Server';
  timestamp: string;
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
  report: {
    id: string;
    filename: string;
    downloadUrl: string;
    generatedAt: string;
  } | null;
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

export async function requestLocalServer<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getLocalServerUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
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
  const downloadMatch = new RegExp(`^/api/reports/(${uuidPattern})/download$`, 'i').exec(downloadUrl);
  if (!downloadMatch || !new RegExp(`^${uuidPattern}$`, 'i').test(reportId)
      || downloadMatch[1].toLowerCase() !== reportId.toLowerCase()) {
    throw new LocalServerApiError('Invalid official report reference', 0, 'VALIDATION');
  }
  const shortInspectionId = inspectionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8);
  const target = new File(Paths.document, `reporte_oficial_${shortInspectionId}_${reportId}.xlsx`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await expoFetch(`${getLocalServerUrl()}${downloadUrl}`, {
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
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
  const response = await requestLocalServer<HealthResponse>('/api/health');
  if (!response.ok || response.service !== 'ExtinCheck Local Server') {
    throw new LocalServerApiError('Unexpected health response', 0, 'SERVER');
  }
  return response;
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
