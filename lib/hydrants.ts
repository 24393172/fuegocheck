import { HydrantCheckValue, HydrantCollection, HydrantRecord } from '../types/hydrant.types';
import { generateId } from './uuid';

export const MAX_HYDRANTS = 38;

const DATA_KEYS = [
  'numero',
  'ubicacion',
  'locationNameSnapshot',
  'gabinete',
  'gabinete_comentario',
  'senalamiento',
  'senalamiento_comentario',
  'calcomania',
  'calcomania_comentario',
  'valvula_angular',
  'valvula_angular_comentario',
  'manguera',
  'manguera_comentario',
  'chiflon',
  'chiflon_comentario',
  'llave_acople',
  'llave_acople_comentario',
  'observaciones',
] as const;

const CHECK_KEYS = [
  'gabinete',
  'senalamiento',
  'calcomania',
  'valvula_angular',
  'manguera',
  'chiflon',
  'llave_acople',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function checkValue(value: unknown): HydrantCheckValue {
  return value === 'si' || value === 'no' || value === 'na' ? value : '';
}

function timestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hasRecordData(value: Record<string, unknown>): boolean {
  return DATA_KEYS.some((key) => text(value[key]).trim().length > 0);
}

function normalizeRecord(
  source: Record<string, unknown>,
  now: number,
  usedIds: Set<string>
): HydrantRecord {
  let id = text(source.id).trim();
  if (!id || usedIds.has(id)) id = generateId();
  usedIds.add(id);
  const createdAt = timestamp(source.createdAt, now);
  const locationName = text(source.locationNameSnapshot || source.ubicacion);
  const locationId = text(source.locationId).trim() || null;

  return {
    id,
    numero: text(source.numero),
    ubicacion: locationName,
    locationId,
    locationNameSnapshot: locationName,
    customLocation: source.customLocation === true || (!locationId && Boolean(locationName.trim())),
    gabinete: checkValue(source.gabinete),
    gabinete_comentario: text(source.gabinete_comentario),
    senalamiento: checkValue(source.senalamiento),
    senalamiento_comentario: text(source.senalamiento_comentario),
    calcomania: checkValue(source.calcomania),
    calcomania_comentario: text(source.calcomania_comentario),
    valvula_angular: checkValue(source.valvula_angular),
    valvula_angular_comentario: text(source.valvula_angular_comentario),
    manguera: checkValue(source.manguera),
    manguera_comentario: text(source.manguera_comentario),
    chiflon: checkValue(source.chiflon),
    chiflon_comentario: text(source.chiflon_comentario),
    llave_acople: checkValue(source.llave_acople),
    llave_acople_comentario: text(source.llave_acople_comentario),
    observaciones: text(source.observaciones),
    createdAt,
    updatedAt: timestamp(source.updatedAt, createdAt),
  };
}

export function createEmptyHydrant(id = generateId(), now = Date.now()): HydrantRecord {
  return normalizeRecord({ id, createdAt: now, updatedAt: now }, now, new Set());
}

// Converts the legacy single Hidrantes object to { items: [...] } and repairs
// missing or duplicate ids without duplicating valid records.
export function normalizeHydrantsData(
  value: unknown,
  now = Date.now()
): { collection: HydrantCollection; changed: boolean } {
  const source = isObject(value) ? value : {};
  const rawItems = Array.isArray(source.items)
    ? source.items.filter(isObject)
    : hasRecordData(source)
      ? [source]
      : [];
  const usedIds = new Set<string>();
  const collection = {
    items: rawItems.map((item) => normalizeRecord(item, now, usedIds)),
  };
  return {
    collection,
    changed: JSON.stringify(source) !== JSON.stringify(collection),
  };
}

export function readHydrantItems(value: unknown): Array<Record<string, unknown>> {
  if (!isObject(value)) return [];
  if (Array.isArray(value.items)) return value.items.filter(isObject);
  return hasRecordData(value) ? [value] : [];
}

export function hasAnyHydrantData(value: unknown): boolean {
  return isObject(value) && hasRecordData(value);
}

export function isHydrantComplete(value: unknown): boolean {
  if (!isObject(value)) return false;
  const identityComplete = [value.numero, value.locationNameSnapshot || value.ubicacion]
    .every((field) => text(field).trim().length > 0);
  return identityComplete && CHECK_KEYS.every((key) => checkValue(value[key]) !== '');
}

export function hydrantCollectionProgress(value: unknown) {
  const items = readHydrantItems(value);
  const completed = items.filter((item) => isHydrantComplete(item)).length;
  return {
    total: items.length,
    completed,
    hasAnyData: items.length > 0,
    complete: items.length > 0 && completed === items.length,
  };
}
