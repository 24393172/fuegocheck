import { FormSchema } from '../types/form.types';
import {
  AlarmAnswer,
  AlarmCheckValue,
  AlarmDeviceCollection,
  AlarmDeviceFormId,
  AlarmDeviceItem,
  AlarmFormStatus,
  AlarmMobileFormId,
  AlarmPanelData,
  AlarmsData,
} from '../types/alarm.types';
import { generateId } from './uuid';

export const ALARM_FORMAT_ID = 'alarms';
export const MAX_ALARM_DEVICES = 20;
export const ALARM_MOBILE_IDS: AlarmMobileFormId[] = [
  'tablero_ad',
  'dispositivos_ad',
  'dispositivos_convencionales',
  'dispositivos_notificacion',
];

export const ALARM_DEVICE_KEYS: Record<Exclude<AlarmMobileFormId, 'tablero_ad'>, AlarmDeviceFormId> = {
  dispositivos_ad: 'addressedDevices',
  dispositivos_convencionales: 'conventionalDevices',
  dispositivos_notificacion: 'notificationDevices',
};

export const ALARM_FORM_LABELS: Record<AlarmMobileFormId, string> = {
  tablero_ad: 'Tablero de alarma y detección',
  dispositivos_ad: 'Dispositivos direccionados',
  dispositivos_convencionales: 'Dispositivos convencionales',
  dispositivos_notificacion: 'Dispositivos de notificación',
};

// These are semantic migrations from the former 18-question schema to the
// exact 28-question official sheet. They intentionally do not infer by array
// position or visible label.
const LEGACY_PANEL_ID_MAP: Record<string, string> = {
  '1_8': '1_9',
  '1_9': '1_11',
  '2_6': '2_7',
  '2_7': '2_11',
  '2_8': '2_12',
  '2_9': '2_13',
};

const DEVICE_DATA_KEYS = [
  'identificador', 'identifier', 'loop', 'dispositivo', 'deviceType', 'ubicacion',
  'locationNameSnapshot', 'alarma', 'alarm', 'supervision', 'limpieza', 'cleaning',
  'observaciones', 'observations',
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function timestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function check(value: unknown): AlarmCheckValue {
  return value === 'si' || value === 'no' || value === 'na' ? value : '';
}

function status(value: unknown): AlarmFormStatus {
  return value === 'not_started' || value === 'in_progress' || value === 'complete'
    || value === 'not_applicable' ? value : 'not_started';
}

function meaningfulDevice(value: Record<string, unknown>): boolean {
  return DEVICE_DATA_KEYS.some((key) => text(value[key]).trim().length > 0);
}

function emptyPanel(now: number): AlarmPanelData {
  return { status: 'not_started', answers: {}, observations: '', updatedAt: now };
}

function emptyCollection(now: number): AlarmDeviceCollection {
  return { status: 'not_started', items: [], observations: '', updatedAt: now };
}

function answerFromFlat(questionId: string, source: Record<string, unknown>): AlarmAnswer | null {
  const answer = check(source[questionId]);
  const parameter = source[`${questionId}_parametro`];
  const reading = source[`${questionId}_lectura`];
  const comment = text(source[`${questionId}_comentario`]);
  if (!answer && parameter === undefined && reading === undefined && !comment) return null;
  return {
    questionId,
    ...(answer ? { answer } : {}),
    ...(parameter !== undefined && parameter !== '' ? { parameter: parameter as string | number } : {}),
    ...(reading !== undefined && reading !== '' ? { reading: reading as string | number } : {}),
    ...(comment ? { comment } : {}),
  };
}

function normalizePanel(source: unknown, legacyFlat: unknown, schema: FormSchema, now: number): AlarmPanelData {
  if (isObject(source) && isObject(source.answers)) {
    const answers: Record<string, AlarmAnswer> = {};
    for (const [key, value] of Object.entries(source.answers)) {
      if (!isObject(value)) continue;
      const questionId = text(value.questionId || key).trim();
      if (!questionId) continue;
      const answerValue = check(value.answer);
      answers[questionId] = {
        questionId,
        ...(answerValue ? { answer: answerValue } : {}),
        ...(value.parameter !== undefined ? { parameter: value.parameter as string | number } : {}),
        ...(value.reading !== undefined ? { reading: value.reading as string | number } : {}),
        ...(text(value.comment) ? { comment: text(value.comment) } : {}),
      };
    }
    return {
      status: status(source.status),
      answers,
      observations: text(source.observations),
      updatedAt: timestamp(source.updatedAt, now),
    };
  }

  const flat = isObject(legacyFlat) ? legacyFlat : {};
  const answers: Record<string, AlarmAnswer> = {};
  const questionIds = schema.sections.flatMap((section) => section.fields)
    .filter((field) => field.type === 'yes_no_na')
    .map((field) => field.key);
  for (const oldId of questionIds) {
    const targetId = LEGACY_PANEL_ID_MAP[oldId] ?? oldId;
    const migrated = answerFromFlat(oldId, flat);
    if (migrated) answers[targetId] = { ...migrated, questionId: targetId };
  }
  const panel = {
    status: 'not_started' as AlarmFormStatus,
    answers,
    observations: text(flat.observaciones),
    updatedAt: now,
  };
  return { ...panel, status: derivePanelStatus(schema, panel) };
}

function normalizeDevice(
  source: Record<string, unknown>,
  now: number,
  usedIds: Set<string>
): AlarmDeviceItem {
  let id = text(source.id).trim();
  if (!UUID_PATTERN.test(id) || usedIds.has(id)) id = generateId();
  usedIds.add(id);
  const locationName = text(source.locationNameSnapshot || source.ubicacion);
  const locationId = text(source.locationId).trim() || null;
  const createdAt = timestamp(source.createdAt, now);
  return {
    id,
    identifier: text(source.identifier || source.identificador),
    loop: text(source.loop),
    deviceType: text(source.deviceType || source.dispositivo),
    locationId,
    locationNameSnapshot: locationName,
    customLocation: source.customLocation === true || (!locationId && Boolean(locationName.trim())),
    alarm: check(source.alarm ?? source.alarma),
    supervision: check(source.supervision),
    cleaning: check(source.cleaning ?? source.limpieza),
    observations: text(source.observations ?? source.observaciones),
    createdAt,
    updatedAt: timestamp(source.updatedAt, createdAt),
  };
}

function normalizeCollection(
  source: unknown,
  legacyFlat: unknown,
  now: number,
  usedIds: Set<string>
): AlarmDeviceCollection {
  const current = isObject(source) ? source : {};
  const legacy = isObject(legacyFlat) ? legacyFlat : {};
  const rawItems = Array.isArray(current.items)
    ? current.items.filter(isObject)
    : meaningfulDevice(current)
      ? [current]
      : meaningfulDevice(legacy)
        ? [legacy]
        : [];
  const items = rawItems.map((item) => normalizeDevice(item, now, usedIds));
  const explicitStatus = status(current.status);
  const collection: AlarmDeviceCollection = {
    status: explicitStatus === 'not_applicable'
      ? explicitStatus
      : deriveDeviceStatus({ status: explicitStatus, items, observations: '', updatedAt: now }),
    items,
    observations: text(current.observations),
    updatedAt: timestamp(current.updatedAt, now),
  };
  return collection;
}

function systemCandidates(source: Record<string, unknown>, legacyPumps: Record<string, unknown>) {
  const candidates: Array<{ source: string; value: string }> = [];
  const add = (label: string, value: unknown) => {
    const normalized = text(value).trim();
    if (normalized) candidates.push({ source: label, value: normalized });
  };
  add('alarms.systemName', source.systemName);
  const panel = isObject(source.panel) ? source.panel : {};
  add('alarms.panel.sistema', panel.sistema);
  add('pumps.tablero_ad.sistema', isObject(legacyPumps.tablero_ad) ? legacyPumps.tablero_ad.sistema : '');
  add('pumps.dispositivos_ad.sistema', isObject(legacyPumps.dispositivos_ad) ? legacyPumps.dispositivos_ad.sistema : '');
  add('pumps.dispositivos_convencionales.sistema', isObject(legacyPumps.dispositivos_convencionales)
    ? legacyPumps.dispositivos_convencionales.sistema : '');
  add('pumps.dispositivos_notificacion.sistema', isObject(legacyPumps.dispositivos_notificacion)
    ? legacyPumps.dispositivos_notificacion.sistema : '');
  return candidates;
}

export function normalizeAlarmsData(
  formData: unknown,
  panelSchema: FormSchema,
  now = Date.now()
): { data: AlarmsData; changed: boolean } {
  const root = isObject(formData) ? formData : {};
  const source = isObject(root.alarms) ? root.alarms : {};
  const legacyPumps = isObject(root.pumps) ? root.pumps : {};
  const candidates = systemCandidates(source, legacyPumps);
  const systemName = text(source.systemName).trim() || candidates[0]?.value || '';
  const previousDiscrepancies = Array.isArray(source.systemNameDiscrepancies)
    ? source.systemNameDiscrepancies.filter(isObject).map((item) => ({
      source: text(item.source).trim(),
      value: text(item.value).trim(),
    })).filter((item) => item.source && item.value)
    : [];
  const discrepancies = [...previousDiscrepancies, ...candidates]
    .filter((candidate) => candidate.value !== systemName)
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.source === candidate.source && item.value === candidate.value) === index
    );
  const usedDeviceIds = new Set<string>();
  const data: AlarmsData = {
    systemName,
    systemNameDiscrepancies: discrepancies,
    panel: normalizePanel(source.panel, legacyPumps.tablero_ad, panelSchema, now),
    addressedDevices: normalizeCollection(
      source.addressedDevices, legacyPumps.dispositivos_ad, now, usedDeviceIds
    ),
    conventionalDevices: normalizeCollection(
      source.conventionalDevices, legacyPumps.dispositivos_convencionales, now, usedDeviceIds
    ),
    notificationDevices: normalizeCollection(
      source.notificationDevices, legacyPumps.dispositivos_notificacion, now, usedDeviceIds
    ),
  };
  return { data, changed: JSON.stringify(source) !== JSON.stringify(data) };
}

export function panelToFlatValues(panel: AlarmPanelData): Record<string, unknown> {
  const values: Record<string, unknown> = { observaciones: panel.observations };
  for (const answer of Object.values(panel.answers)) {
    if (answer.answer) values[answer.questionId] = answer.answer;
    if (answer.parameter !== undefined) values[`${answer.questionId}_parametro`] = answer.parameter;
    if (answer.reading !== undefined) values[`${answer.questionId}_lectura`] = answer.reading;
    if (answer.comment) values[`${answer.questionId}_comentario`] = answer.comment;
  }
  return values;
}

export function buildAlarmPanel(
  schema: FormSchema,
  values: Record<string, unknown>,
  previous: AlarmPanelData
): AlarmPanelData {
  const answers: Record<string, AlarmAnswer> = {};
  for (const field of schema.sections.flatMap((section) => section.fields)) {
    if (field.type !== 'yes_no_na') continue;
    const answer = answerFromFlat(field.key, values);
    if (answer) answers[field.key] = answer;
  }
  const panel: AlarmPanelData = {
    ...previous,
    answers,
    observations: text(values.observaciones),
    updatedAt: Date.now(),
  };
  return {
    ...panel,
    status: previous.status === 'not_applicable' ? 'not_applicable' : derivePanelStatus(schema, panel),
  };
}

export function createEmptyAlarmDevice(id = generateId(), now = Date.now()): AlarmDeviceItem {
  return normalizeDevice({ id, createdAt: now, updatedAt: now }, now, new Set());
}

export function hasAnyAlarmDeviceData(value: Partial<AlarmDeviceItem>): boolean {
  return [
    value.identifier, value.loop, value.deviceType, value.locationNameSnapshot,
    value.alarm, value.supervision, value.cleaning, value.observations,
  ].some((item) => text(item).trim().length > 0);
}

export function isAlarmDeviceComplete(value: Partial<AlarmDeviceItem>): boolean {
  return [value.identifier, value.loop, value.deviceType, value.locationNameSnapshot]
    .every((item) => text(item).trim().length > 0)
    && [value.alarm, value.supervision, value.cleaning]
      .every((item) => check(item) !== '');
}

export function deriveDeviceStatus(collection: AlarmDeviceCollection): AlarmFormStatus {
  if (collection.status === 'not_applicable') return 'not_applicable';
  if (!collection.items.length) return 'not_started';
  return collection.items.every(isAlarmDeviceComplete) ? 'complete' : 'in_progress';
}

export function derivePanelStatus(schema: FormSchema, panel: AlarmPanelData): AlarmFormStatus {
  if (panel.status === 'not_applicable') return 'not_applicable';
  const requiredIds = schema.sections.flatMap((section) => section.fields)
    .filter((field) => field.type === 'yes_no_na')
    .map((field) => field.key);
  const answered = requiredIds.filter((questionId) => panel.answers[questionId]?.answer).length;
  if (!answered && !panel.observations.trim()) return 'not_started';
  return answered === requiredIds.length ? 'complete' : 'in_progress';
}

export function alarmGroupProgress(data: AlarmsData, panelSchema: FormSchema) {
  const panelStatus = data.panel.status === 'not_applicable'
    ? 'not_applicable'
    : derivePanelStatus(panelSchema, data.panel);
  const forms = [
    panelStatus,
    deriveDeviceStatus(data.addressedDevices),
    deriveDeviceStatus(data.conventionalDevices),
    deriveDeviceStatus(data.notificationDevices),
  ];
  return {
    completed: forms.filter((formStatus) => formStatus === 'complete' || formStatus === 'not_applicable').length,
    total: 4,
    complete: forms.every((formStatus) => formStatus === 'complete' || formStatus === 'not_applicable'),
    statuses: forms,
  };
}

export function alarmMissingFields(data: AlarmsData, panelSchema: FormSchema): string[] {
  const missing: string[] = [];
  if (data.panel.status !== 'not_applicable') {
    const unanswered = panelSchema.sections.flatMap((section) => section.fields)
      .filter((field) => field.type === 'yes_no_na' && !data.panel.answers[field.key]?.answer)
      .map((field) => field.label);
    if (unanswered.length) missing.push(`Tablero: ${unanswered[0]}`);
  }
  for (const [key, label] of [
    ['addressedDevices', 'Dispositivos direccionados'],
    ['conventionalDevices', 'Dispositivos convencionales'],
    ['notificationDevices', 'Dispositivos de notificación'],
  ] as const) {
    const collection = data[key];
    if (collection.status === 'not_applicable') continue;
    if (!data.systemName.trim()) missing.push(`${label}: sistema`);
    if (!collection.items.length) missing.push(`${label}: sin registros`);
    const incomplete = collection.items.findIndex((item) => !isAlarmDeviceComplete(item));
    if (incomplete >= 0) missing.push(`${label}: registro ${incomplete + 1} incompleto`);
  }
  return [...new Set(missing)];
}

export function alarmPayload(data: AlarmsData) {
  return {
    systemName: data.systemName,
    systemNameDiscrepancies: data.systemNameDiscrepancies,
    panel: {
      formType: 'alarm_panel' as const,
      status: data.panel.status,
      observations: data.panel.observations,
      updatedAt: data.panel.updatedAt,
      answers: Object.values(data.panel.answers),
    },
    addressedDevices: {
      formType: 'addressed_devices' as const,
      ...data.addressedDevices,
    },
    conventionalDevices: {
      formType: 'conventional_devices' as const,
      ...data.conventionalDevices,
    },
    notificationDevices: {
      formType: 'notification_devices' as const,
      ...data.notificationDevices,
    },
  };
}
