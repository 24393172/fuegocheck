import { CatalogExtinguisherLocation } from '../types/catalog.types';
import {
  ConfiguredExtinguisher,
  ExtinguisherCheckValue,
  ExtinguisherCollection,
  ExtinguisherRecord,
} from '../types/extinguisher.types';
import { generateId } from './uuid';

export const MAX_EXTINGUISHERS = 115;

export function configuredExtinguisher(location: CatalogExtinguisherLocation): ConfiguredExtinguisher {
  return {
    id: location.id,
    numero: location.identifier,
    ubicacion: location.name,
    tipo_extintor: location.extinguisherType,
    capacidad: location.capacity,
  };
}

export function createConfiguredExtinguisher(
  equipment: ConfiguredExtinguisher,
  existing?: ExtinguisherRecord,
  now = Date.now()
): ExtinguisherRecord {
  const createdAt = existing?.createdAt ?? now;
  return {
    ...createEmptyExtinguisher(equipment.id, createdAt),
    ...existing,
    id: equipment.id,
    numero: equipment.numero,
    ubicacion: equipment.ubicacion,
    locationId: equipment.id,
    locationNameSnapshot: equipment.ubicacion,
    customLocation: false,
    tipo_extintor: equipment.tipo_extintor,
    capacidad: equipment.capacidad,
    createdAt,
    updatedAt: now,
  };
}

export function capturedConfiguredIds(items: ExtinguisherRecord[]): Set<string> {
  return new Set(items.flatMap((item) => [item.id, item.locationId].filter(Boolean) as string[]));
}

export function configuredExtinguisherProgress(
  configured: CatalogExtinguisherLocation[],
  items: ExtinguisherRecord[]
) {
  const capturedIds = capturedConfiguredIds(items);
  const available = configured.filter((item) => !capturedIds.has(item.id));
  return {
    inspected: configured.length - available.length,
    total: configured.length,
    available,
    capturedIds,
  };
}

const DATA_KEYS = [
  'numero',
  'ubicacion',
  'tipo_extintor',
  'capacidad',
  'proxima_recarga',
  'presion',
  'presion_comentario',
  'altura',
  'altura_comentario',
  'seguro',
  'seguro_comentario',
  'pintura',
  'pintura_comentario',
  'manguera',
  'manguera_comentario',
  'difusor',
  'difusor_comentario',
  'senalamiento',
  'senalamiento_comentario',
  'observaciones',
] as const;

const CHECK_KEYS = [
  'presion',
  'altura',
  'seguro',
  'pintura',
  'manguera',
  'difusor',
  'senalamiento',
] as const;

const INSPECTION_DATA_KEYS = [
  'proxima_recarga',
  ...CHECK_KEYS,
  'presion_comentario',
  'altura_comentario',
  'seguro_comentario',
  'pintura_comentario',
  'manguera_comentario',
  'difusor_comentario',
  'senalamiento_comentario',
  'observaciones',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function checkValue(value: unknown): ExtinguisherCheckValue {
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
): ExtinguisherRecord {
  let id = text(source.id).trim();
  if (!id || usedIds.has(id)) id = generateId();
  usedIds.add(id);
  const createdAt = timestamp(source.createdAt, now);

  return {
    id,
    numero: text(source.numero),
    ubicacion: text(source.ubicacion),
    locationId: text(source.locationId).trim() || null,
    locationNameSnapshot: text(source.locationNameSnapshot || source.ubicacion),
    customLocation: source.customLocation === true || (!text(source.locationId).trim() && Boolean(text(source.ubicacion).trim())),
    tipo_extintor: text(source.tipo_extintor),
    capacidad: text(source.capacidad),
    proxima_recarga: text(source.proxima_recarga),
    presion: checkValue(source.presion),
    presion_comentario: text(source.presion_comentario),
    altura: checkValue(source.altura),
    altura_comentario: text(source.altura_comentario),
    seguro: checkValue(source.seguro),
    seguro_comentario: text(source.seguro_comentario),
    pintura: checkValue(source.pintura),
    pintura_comentario: text(source.pintura_comentario),
    manguera: checkValue(source.manguera),
    manguera_comentario: text(source.manguera_comentario),
    difusor: checkValue(source.difusor),
    difusor_comentario: text(source.difusor_comentario),
    senalamiento: checkValue(source.senalamiento),
    senalamiento_comentario: text(source.senalamiento_comentario),
    observaciones: text(source.observaciones),
    createdAt,
    updatedAt: timestamp(source.updatedAt, createdAt),
  };
}

export function createEmptyExtinguisher(id = generateId(), now = Date.now()): ExtinguisherRecord {
  return normalizeRecord({ id, createdAt: now, updatedAt: now }, now, new Set());
}

// Converts the legacy single object to { items: [...] }. Existing collections
// are also repaired if an item is missing an id/timestamp or repeats an id.
export function normalizeExtinguisherCollection(
  value: unknown,
  now = Date.now()
): { collection: ExtinguisherCollection; changed: boolean } {
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

// Read-only projection used by summary/progress screens. It deliberately does
// not generate ids; the Extintores list persists the full normalization.
export function readExtinguisherItems(value: unknown): Array<Record<string, unknown>> {
  if (!isObject(value)) return [];
  if (Array.isArray(value.items)) return value.items.filter(isObject);
  return hasRecordData(value) ? [value] : [];
}

export function hasAnyExtinguisherData(value: unknown): boolean {
  return isObject(value) && hasRecordData(value);
}

export function hasAnyExtinguisherInspectionData(value: unknown): boolean {
  return isObject(value) && INSPECTION_DATA_KEYS.some(
    (key) => text(value[key]).trim().length > 0
  );
}

export function isExtinguisherComplete(value: unknown): boolean {
  if (!isObject(value)) return false;
  const identityComplete = [
    value.numero,
    value.ubicacion,
    value.tipo_extintor,
    value.capacidad,
    value.proxima_recarga,
  ].every((field) => text(field).trim().length > 0);
  return identityComplete && CHECK_KEYS.every((key) => checkValue(value[key]) !== '');
}

export function extinguisherCollectionProgress(value: unknown) {
  const items = readExtinguisherItems(value);
  const completed = items.filter((item) => isExtinguisherComplete(item)).length;
  return {
    total: items.length,
    completed,
    hasAnyData: items.length > 0,
    complete: items.length > 0 && completed === items.length,
  };
}
