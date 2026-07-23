import { PUMP_SCHEMAS } from '../schemas';
import { FormField, FormSchema } from '../types/form.types';
import {
  FirePumpAnswer,
  FirePumpAnswerValue,
  FirePumpFormData,
  FirePumpFormId,
  FirePumpFormStatus,
  FirePumpsData,
} from '../types/fire-pump.types';

const PUMP_IDS: FirePumpFormId[] = ['jockey', 'electrica', 'diesel'];
const VALID_STATUSES = new Set<FirePumpFormStatus>([
  'not_started', 'in_progress', 'complete', 'not_applicable',
]);
const VALID_ANSWERS = new Set<FirePumpAnswerValue>(['si', 'no', 'na']);

function emptyForm(): FirePumpFormData {
  return { status: 'not_started', answers: {}, observations: '', updatedAt: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function scalar(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function normalizeAnswer(questionId: string, value: unknown): FirePumpAnswer | null {
  if (!isRecord(value)) {
    const reading = scalar(value);
    return reading === undefined ? null : { questionId, reading };
  }
  const answer = VALID_ANSWERS.has(value.answer as FirePumpAnswerValue)
    ? value.answer as FirePumpAnswerValue
    : undefined;
  const parameter = scalar(value.parameter);
  const reading = scalar(value.reading);
  const comment = typeof value.comment === 'string' ? value.comment : undefined;
  if (!answer && parameter === undefined && reading === undefined && comment === undefined) return null;
  return { questionId, answer, parameter, reading, comment };
}

function schemaFor(id: FirePumpFormId): FormSchema {
  const schema = PUMP_SCHEMAS.find((item) => item.id === id);
  if (!schema) throw new Error(`Missing fire pump schema: ${id}`);
  return schema;
}

function legacyFlatToForm(id: FirePumpFormId, source: Record<string, unknown>): FirePumpFormData {
  const answers: Record<string, FirePumpAnswer> = {};
  const schema = schemaFor(id);
  const knownKeys = new Set<string>();

  for (const section of schema.sections) {
    for (const field of section.fields) {
      knownKeys.add(field.key);
      if (field.type === 'photo' || field.key === 'observaciones') continue;
      const raw = source[field.key];
      const comment = typeof source[`${field.key}_comentario`] === 'string'
        ? source[`${field.key}_comentario`] as string
        : undefined;
      if (field.type === 'yes_no_na') {
        const answer = VALID_ANSWERS.has(raw as FirePumpAnswerValue)
          ? raw as FirePumpAnswerValue
          : undefined;
        if (answer || comment) {
          answers[field.key] = {
            questionId: field.key,
            answer,
            parameter: field.parametro,
            comment,
          };
        }
      } else {
        const reading = scalar(raw);
        if (reading !== undefined && reading !== '') {
          answers[field.key] = { questionId: field.key, reading };
        }
      }
    }
  }

  // Preserve unknown scalar legacy values under their original stable keys.
  for (const [key, value] of Object.entries(source)) {
    if (knownKeys.has(key) || key.endsWith('_comentario') || key === 'observaciones') continue;
    const normalized = normalizeAnswer(key, value);
    if (normalized && !answers[key]) answers[key] = normalized;
  }

  const observations = typeof source.observaciones === 'string' ? source.observaciones : '';
  const form: FirePumpFormData = {
    status: 'not_started',
    answers,
    observations,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : 0,
  };
  form.status = firePumpProgress(schema, form).status;
  return form;
}

function normalizeForm(id: FirePumpFormId, value: unknown): FirePumpFormData {
  if (!isRecord(value)) return emptyForm();
  if (!isRecord(value.answers) && !Array.isArray(value.answers)) return legacyFlatToForm(id, value);

  const answers: Record<string, FirePumpAnswer> = {};
  const entries = Array.isArray(value.answers)
    ? value.answers.map((item) => [isRecord(item) ? item.questionId : '', item] as const)
    : Object.entries(value.answers);
  for (const [rawKey, rawValue] of entries) {
    const questionId = typeof rawKey === 'string' && rawKey
      ? rawKey
      : isRecord(rawValue) && typeof rawValue.questionId === 'string'
        ? rawValue.questionId
        : '';
    if (!questionId || answers[questionId]) continue;
    const answer = normalizeAnswer(questionId, rawValue);
    if (answer) answers[questionId] = answer;
  }

  const form: FirePumpFormData = {
    status: VALID_STATUSES.has(value.status as FirePumpFormStatus)
      ? value.status as FirePumpFormStatus
      : 'not_started',
    answers,
    observations: typeof value.observations === 'string' ? value.observations : '',
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
  if (form.status !== 'not_applicable') form.status = firePumpProgress(schemaFor(id), form).status;
  return form;
}

export function normalizeFirePumpsData(value: unknown): {
  data: FirePumpsData;
  changed: boolean;
} {
  const container = isRecord(value) ? value : {};
  const merged = isRecord(container.pumps) || isRecord(container.firePumps)
    ? {
      ...(isRecord(container.pumps) ? container.pumps : {}),
      ...(isRecord(container.firePumps) ? container.firePumps : {}),
    }
    : container;
  const source = Object.fromEntries(
    PUMP_IDS.filter((id) => Object.prototype.hasOwnProperty.call(merged, id))
      .map((id) => [id, merged[id]])
  ) as Record<string, unknown>;
  const data: FirePumpsData = {
    jockey: normalizeForm('jockey', source.jockey),
    electrica: normalizeForm('electrica', source.electrica),
    diesel: normalizeForm('diesel', source.diesel),
  };
  let changed = false;
  try {
    changed = JSON.stringify(source) !== JSON.stringify(data);
  } catch {
    changed = true;
  }
  return { data, changed };
}

export function firePumpFormToFlatValues(form: FirePumpFormData): Record<string, unknown> {
  const values: Record<string, unknown> = { observaciones: form.observations };
  for (const answer of Object.values(form.answers)) {
    if (answer.answer) values[answer.questionId] = answer.answer;
    if (answer.reading !== undefined) values[answer.questionId] = answer.reading;
    if (answer.comment !== undefined) values[`${answer.questionId}_comentario`] = answer.comment;
  }
  return values;
}

export function buildFirePumpForm(
  schema: FormSchema,
  values: Record<string, unknown>,
  previous?: FirePumpFormData,
  updatedAt = Date.now()
): FirePumpFormData {
  const answers: Record<string, FirePumpAnswer> = { ...(previous?.answers ?? {}) };
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === 'photo' || field.key === 'observaciones') continue;
      const raw = values[field.key];
      if (field.type === 'yes_no_na') {
        const answer = VALID_ANSWERS.has(raw as FirePumpAnswerValue)
          ? raw as FirePumpAnswerValue
          : undefined;
        const commentValue = values[`${field.key}_comentario`];
        const comment = typeof commentValue === 'string' ? commentValue : undefined;
        if (answer || comment) {
          answers[field.key] = {
            questionId: field.key,
            answer,
            parameter: field.parametro,
            comment,
          };
        } else {
          delete answers[field.key];
        }
      } else {
        const reading = scalar(raw);
        if (reading !== undefined && reading !== '') {
          answers[field.key] = { questionId: field.key, reading };
        } else {
          delete answers[field.key];
        }
      }
    }
  }
  const form: FirePumpFormData = {
    status: previous?.status === 'not_applicable' ? 'not_applicable' : 'not_started',
    answers,
    observations: typeof values.observaciones === 'string' ? values.observaciones : '',
    updatedAt,
  };
  if (form.status !== 'not_applicable') form.status = firePumpProgress(schema, form).status;
  return form;
}

function displayName(field: FormField): string {
  return field.label.replace(/^\d+(?:\.\d+)?\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function firePumpProgress(schema: FormSchema, form: FirePumpFormData): {
  total: number;
  answered: number;
  hasAnyData: boolean;
  complete: boolean;
  status: FirePumpFormStatus;
  missing: string[];
} {
  const fields = schema.sections.flatMap((section) => section.fields);
  const readingParent = new Map<string, string>();
  fields.forEach((field) => field.readingKeys?.forEach((key) => readingParent.set(key, field.key)));
  let total = 0;
  let answered = 0;
  const missing: string[] = [];

  for (const field of fields) {
    if (field.type === 'yes_no_na') {
      total++;
      const value = form.answers[field.key]?.answer;
      if (value) answered++;
      else missing.push(displayName(field));
      continue;
    }
    const technicalRequired = field.section === 'datos_bomba' || readingParent.has(field.key);
    if (!technicalRequired || field.type === 'photo' || field.key === 'observaciones') continue;
    const parentId = readingParent.get(field.key);
    if (parentId && form.answers[parentId]?.answer === 'na') continue;
    const value = form.answers[field.key]?.reading;
    if (value === undefined || value === '') missing.push(displayName(field));
  }

  const hasAnyData = Object.keys(form.answers).length > 0 || Boolean(form.observations.trim());
  const complete = total > 0 && missing.length === 0;
  const status: FirePumpFormStatus = complete ? 'complete' : hasAnyData ? 'in_progress' : 'not_started';
  return { total, answered, hasAnyData, complete, status, missing };
}

export function firePumpPayloadForms(data: FirePumpsData): Array<{
  formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel';
  status: FirePumpFormStatus;
  observations: string;
  updatedAt: number;
  answers: FirePumpAnswer[];
}> {
  return PUMP_IDS.map((id) => {
    const form = data[id];
    const formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel' =
      id === 'electrica' ? 'pump_electric' : id === 'jockey' ? 'pump_jockey' : 'pump_diesel';
    return {
      formType,
      status: form.status,
      observations: form.observations,
      updatedAt: form.updatedAt,
      answers: Object.values(form.answers),
    };
  });
}
