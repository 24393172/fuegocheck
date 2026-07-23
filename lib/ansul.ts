import { FormSchema } from '../types/form.types';
import {
  AnsulAnswer,
  AnsulAnswerValue,
  AnsulData,
  AnsulFormStatus,
  AnsulNormalizationIssue,
} from '../types/ansul.types';

export const ANSUL_FORMAT_ID = 'ansul_r102';
export const ANSUL_EVIDENCE_FORMAT = 'ansul';
export const ANSUL_QUESTION_IDS = Array.from({ length: 17 }, (_, index) => String(index + 1));
export const MAX_ANSUL_OBSERVATION_LINES = 8;
export const MAX_ANSUL_OBSERVATION_LINE_LENGTH = 120;
export const MAX_ANSUL_OBSERVATIONS_LENGTH =
  MAX_ANSUL_OBSERVATION_LINES * MAX_ANSUL_OBSERVATION_LINE_LENGTH;

const VALID_ANSWERS = new Set<AnsulAnswerValue>(['si', 'no', 'na']);
const VALID_STATUSES = new Set<AnsulFormStatus>([
  'not_started', 'in_progress', 'complete', 'not_applicable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function scalar(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function answerValue(value: unknown): AnsulAnswerValue | undefined {
  return VALID_ANSWERS.has(value as AnsulAnswerValue) ? value as AnsulAnswerValue : undefined;
}

function normalizeAnswer(
  questionId: string,
  source: unknown,
  flatSource?: Record<string, unknown>
): AnsulAnswer | null {
  if (isRecord(source)) {
    const answer = answerValue(source.answer);
    const quantity = scalar(source.quantity);
    const model = scalar(source.model);
    const comment = text(source.comment).trim();
    const legacyParameter = scalar(source.legacyParameter ?? source.parameter);
    const legacyReading = scalar(source.legacyReading ?? source.reading);
    if (!answer && quantity === undefined && model === undefined && !comment
        && legacyParameter === undefined && legacyReading === undefined) return null;
    return {
      questionId,
      ...(answer ? { answer } : {}),
      ...(quantity !== undefined && quantity !== '' ? { quantity } : {}),
      ...(model !== undefined && model !== '' ? { model } : {}),
      ...(comment ? { comment } : {}),
      ...(legacyParameter !== undefined && legacyParameter !== '' ? { legacyParameter } : {}),
      ...(legacyReading !== undefined && legacyReading !== '' ? { legacyReading } : {}),
    };
  }

  const flat = flatSource ?? {};
  const answer = answerValue(source);
  const quantity = scalar(flat[`${questionId}_quantity`] ?? flat[`${questionId}_cantidad`]);
  const model = scalar(flat[`${questionId}_model`] ?? flat[`${questionId}_modelo`]);
  const comment = text(flat[`${questionId}_comentario`]).trim();
  const legacyParameter = scalar(flat[`${questionId}_parametro`]);
  const legacyReading = scalar(flat[`${questionId}_lectura`]);
  if (!answer && quantity === undefined && model === undefined && !comment
      && legacyParameter === undefined && legacyReading === undefined) return null;
  return {
    questionId,
    ...(answer ? { answer } : {}),
    ...(quantity !== undefined && quantity !== '' ? { quantity } : {}),
    ...(model !== undefined && model !== '' ? { model } : {}),
    ...(comment ? { comment } : {}),
    ...(legacyParameter !== undefined && legacyParameter !== '' ? { legacyParameter } : {}),
    ...(legacyReading !== undefined && legacyReading !== '' ? { legacyReading } : {}),
  };
}

function sourceFromContainer(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isRecord(value.ansul)) return value.ansul;
  if (isRecord(value.pumps) && isRecord(value.pumps[ANSUL_FORMAT_ID])) {
    return value.pumps[ANSUL_FORMAT_ID];
  }
  if (isRecord(value[ANSUL_FORMAT_ID])) return value[ANSUL_FORMAT_ID];
  return value;
}

export function wrapAnsulObservations(value: string): {
  lines: string[];
  valid: boolean;
  message?: string;
} {
  if (value.length > MAX_ANSUL_OBSERVATIONS_LENGTH) {
    return {
      lines: [],
      valid: false,
      message: `Las observaciones de Ansul admiten hasta ${MAX_ANSUL_OBSERVATIONS_LENGTH} caracteres.`,
    };
  }
  const lines: string[] = [];
  for (const explicitLine of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!explicitLine) {
      lines.push('');
      continue;
    }
    let remaining = explicitLine;
    while (remaining.length > MAX_ANSUL_OBSERVATION_LINE_LENGTH) {
      const candidate = remaining.slice(0, MAX_ANSUL_OBSERVATION_LINE_LENGTH + 1);
      const breakAt = candidate.lastIndexOf(' ') > 0
        ? candidate.lastIndexOf(' ')
        : MAX_ANSUL_OBSERVATION_LINE_LENGTH;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).replace(/^ /, '');
    }
    lines.push(remaining);
  }
  if (lines.length > MAX_ANSUL_OBSERVATION_LINES) {
    return {
      lines,
      valid: false,
      message: `Las observaciones de Ansul ocupan ${lines.length} líneas; el formato permite ${MAX_ANSUL_OBSERVATION_LINES}.`,
    };
  }
  return { lines, valid: true };
}

export function ansulProgress(schema: FormSchema, data: AnsulData): {
  total: number;
  answered: number;
  hasAnyData: boolean;
  complete: boolean;
  status: AnsulFormStatus;
  missing: string[];
} {
  if (data.status === 'not_applicable') {
    return {
      total: ANSUL_QUESTION_IDS.length,
      answered: 0,
      hasAnyData: false,
      complete: true,
      status: 'not_applicable',
      missing: [],
    };
  }
  const labels = new Map(schema.sections.flatMap((section) => section.fields)
    .filter((field) => field.type === 'yes_no_na')
    .map((field) => [field.key, field.label.replace(/^\d+\.\s*/, '')]));
  const missing = ANSUL_QUESTION_IDS
    .filter((questionId) => !data.answers[questionId]?.answer)
    .map((questionId) => labels.get(questionId) ?? `Pregunta ${questionId}`);
  const observations = wrapAnsulObservations(data.observations);
  if (!observations.valid) missing.push(observations.message!);
  const answered = ANSUL_QUESTION_IDS.length
    - missing.filter((item) => !item.startsWith('Las observaciones')).length;
  const hasAnyData = Boolean(
    data.systemName.trim()
    || data.capacityGallons.trim()
    || data.observations.trim()
    || Object.keys(data.answers).length
  );
  const complete = missing.length === 0;
  return {
    total: ANSUL_QUESTION_IDS.length,
    answered,
    hasAnyData,
    complete,
    status: complete ? 'complete' : hasAnyData ? 'in_progress' : 'not_started',
    missing,
  };
}

export function normalizeAnsulData(value: unknown, schema: FormSchema, now = Date.now()): {
  data: AnsulData;
  changed: boolean;
} {
  const source = sourceFromContainer(value);
  const record = isRecord(source) ? source : {};
  const issues: AnsulNormalizationIssue[] = Array.isArray(record.normalizationIssues)
    ? record.normalizationIssues.filter(isRecord).map((issue) => ({
      source: text(issue.source) || 'legacy',
      ...(text(issue.questionId) ? { questionId: text(issue.questionId) } : {}),
      message: text(issue.message) || 'Dato anterior requiere revisión',
    }))
    : [];
  const answers: Record<string, AnsulAnswer> = {};
  if (Array.isArray(record.answers)) {
    record.answers.forEach((rawAnswer, index) => {
      if (!isRecord(rawAnswer)) return;
      const questionId = text(rawAnswer.questionId).trim();
      if (!ANSUL_QUESTION_IDS.includes(questionId)) {
        issues.push({ source: `answers[${index}]`, questionId, message: 'questionId anterior no verificable' });
        return;
      }
      if (answers[questionId]) {
        issues.push({ source: `answers[${index}]`, questionId, message: 'Respuesta duplicada conservada solo en su primera aparición' });
        return;
      }
      const answer = normalizeAnswer(questionId, rawAnswer);
      if (answer) answers[questionId] = answer;
    });
  } else if (isRecord(record.answers)) {
    for (const [key, rawAnswer] of Object.entries(record.answers)) {
      const questionId = isRecord(rawAnswer) && text(rawAnswer.questionId).trim()
        ? text(rawAnswer.questionId).trim()
        : key;
      if (!ANSUL_QUESTION_IDS.includes(questionId)) {
        issues.push({ source: `answers.${key}`, questionId, message: 'questionId anterior no verificable' });
        continue;
      }
      if (answers[questionId]) {
        issues.push({ source: `answers.${key}`, questionId, message: 'Respuesta duplicada no reasignada' });
        continue;
      }
      const answer = normalizeAnswer(questionId, rawAnswer);
      if (answer) answers[questionId] = answer;
    }
  } else {
    for (const questionId of ANSUL_QUESTION_IDS) {
      const answer = normalizeAnswer(questionId, record[questionId], record);
      if (answer) answers[questionId] = answer;
    }
  }

  const baseStatus = VALID_STATUSES.has(record.status as AnsulFormStatus)
    ? record.status as AnsulFormStatus
    : 'not_started';
  const data: AnsulData = {
    status: baseStatus,
    systemName: text(record.systemName ?? record.sistema ?? record.nombre_sistema),
    capacityGallons: text(record.capacityGallons ?? record.capacidad_galones),
    answers,
    observations: text(record.observations ?? record.observaciones),
    normalizationIssues: issues,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : now,
  };
  if (data.status !== 'not_applicable') data.status = ansulProgress(schema, data).status;
  let changed = false;
  try { changed = JSON.stringify(record) !== JSON.stringify(data); } catch { changed = true; }
  return { data, changed };
}

export function ansulToFlatValues(data: AnsulData): Record<string, unknown> {
  const values: Record<string, unknown> = {
    systemName: data.systemName,
    capacidad_galones: data.capacityGallons,
    observaciones: data.observations,
  };
  for (const answer of Object.values(data.answers)) {
    if (answer.answer) values[answer.questionId] = answer.answer;
    if (answer.quantity !== undefined) values[`${answer.questionId}_quantity`] = answer.quantity;
    if (answer.model !== undefined) values[`${answer.questionId}_model`] = answer.model;
    if (answer.comment !== undefined) values[`${answer.questionId}_comentario`] = answer.comment;
  }
  return values;
}

export function buildAnsulData(
  schema: FormSchema,
  values: Record<string, unknown>,
  previous?: AnsulData,
  updatedAt = Date.now()
): AnsulData {
  const answers: Record<string, AnsulAnswer> = {};
  for (const questionId of ANSUL_QUESTION_IDS) {
    const current = previous?.answers[questionId];
    const answer = answerValue(values[questionId]);
    const quantity = scalar(values[`${questionId}_quantity`]);
    const model = scalar(values[`${questionId}_model`]);
    const commentValue = values[`${questionId}_comentario`];
    const comment = typeof commentValue === 'string' ? commentValue.trim() : '';
    if (answer || (quantity !== undefined && quantity !== '') || (model !== undefined && model !== '')
        || comment || current?.legacyParameter !== undefined || current?.legacyReading !== undefined) {
      answers[questionId] = {
        questionId,
        ...(answer ? { answer } : {}),
        ...(quantity !== undefined && quantity !== '' ? { quantity } : {}),
        ...(model !== undefined && model !== '' ? { model } : {}),
        ...(comment ? { comment } : {}),
        ...(current?.legacyParameter !== undefined ? { legacyParameter: current.legacyParameter } : {}),
        ...(current?.legacyReading !== undefined ? { legacyReading: current.legacyReading } : {}),
      };
    }
  }
  const data: AnsulData = {
    status: previous?.status === 'not_applicable' ? 'not_applicable' : 'not_started',
    systemName: text(values.systemName),
    capacityGallons: text(values.capacidad_galones),
    answers,
    observations: text(values.observaciones),
    normalizationIssues: previous?.normalizationIssues ?? [],
    updatedAt,
  };
  if (data.status !== 'not_applicable') data.status = ansulProgress(schema, data).status;
  return data;
}

export function ansulPayload(data: AnsulData) {
  return {
    formType: ANSUL_FORMAT_ID as 'ansul_r102',
    status: data.status,
    systemName: data.systemName,
    capacityGallons: data.capacityGallons,
    observations: data.observations,
    normalizationIssues: data.normalizationIssues,
    updatedAt: data.updatedAt,
    answers: Object.values(data.answers),
  };
}
