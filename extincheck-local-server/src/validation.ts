import { z } from 'zod';
import {
  FIRE_PUMP_ALLOWED_IDS,
  FIRE_PUMP_CONFIG,
  FIRE_PUMP_FORM_TYPES,
  FIRE_PUMP_MOBILE_IDS,
} from './fire-pump-config.js';
import {
  ALARM_FORM_TYPES,
  ALARM_MOBILE_IDS,
  ALARM_PANEL_ALLOWED_IDS,
  MAX_ALARM_DEVICES,
} from './alarm-config.js';
import {
  ANSUL_ALLOWED_IDS,
  ANSUL_FORMAT_ID,
  MAX_ANSUL_OBSERVATIONS_LENGTH,
  wrapAnsulObservations,
} from './ansul-config.js';

const id = z.string().trim().min(1).max(128);
const shortText = z.string().trim().max(200);
const mediumText = z.string().trim().max(500);
const longText = z.string().trim().max(2000);
const checkValue = z.enum(['si', 'no', 'na']);
const MAX_SIGNATURE_BYTES = 1024 * 1024;
const MAX_SIGNATURE_DIMENSION = 4096;

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export const inspectionSignatureSchema = z.object({
  mimeType: z.literal('image/png'),
  dataBase64: z.string().min(1).max(Math.ceil(MAX_SIGNATURE_BYTES * 4 / 3) + 8)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Signature must be valid Base64'),
  signedAt: z.string().datetime(),
  signerName: z.string().trim().min(1).max(200),
}).strict().superRefine((signature, context) => {
  const bytes = Buffer.from(signature.dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES
      || bytes.toString('base64').replace(/=+$/, '') !== signature.dataBase64.replace(/=+$/, '')) {
    context.addIssue({ code: 'custom', path: ['dataBase64'], message: 'Invalid or oversized signature image' });
    return;
  }
  const dimensions = pngDimensions(bytes);
  if (!dimensions) {
    context.addIssue({ code: 'custom', path: ['dataBase64'], message: 'Signature is not a valid PNG image' });
    return;
  }
  if (!dimensions.width || !dimensions.height
      || dimensions.width > MAX_SIGNATURE_DIMENSION || dimensions.height > MAX_SIGNATURE_DIMENSION) {
    context.addIssue({ code: 'custom', path: ['dataBase64'], message: 'Signature image dimensions are invalid' });
  }
});

export const extinguisherSchema = z.object({
  id,
  numero: shortText,
  ubicacion: mediumText,
  tipo_extintor: shortText,
  capacidad: shortText,
  proxima_recarga: shortText,
  presion: checkValue,
  presion_comentario: longText,
  altura: checkValue,
  altura_comentario: longText,
  seguro: checkValue,
  seguro_comentario: longText,
  pintura: checkValue,
  pintura_comentario: longText,
  manguera: checkValue,
  manguera_comentario: longText,
  difusor: checkValue,
  difusor_comentario: longText,
  senalamiento: checkValue,
  senalamiento_comentario: longText,
  observaciones: longText,
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
}).strict();

export const extinguisherInspectionSchema = z.object({
  inspectionId: id,
  company: z.object({
    id: id.nullish(),
    name: z.string().trim().min(1).max(200),
  }).strict(),
  branch: z.object({
    id: id.nullish(),
    name: shortText,
  }).strict().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
  technician: z.object({
    id: id.nullish(),
    name: z.string().trim().min(1).max(200),
  }).strict(),
  extinguishers: z.array(extinguisherSchema).min(1).max(115),
  sourceDeviceId: id.nullish(),
  syncVersion: z.number().int().nonnegative(),
}).strict().superRefine((payload, context) => {
  const seen = new Set<string>();
  payload.extinguishers.forEach((extinguisher, index) => {
    if (seen.has(extinguisher.id)) {
      context.addIssue({
        code: 'custom',
        path: ['extinguishers', index, 'id'],
        message: 'Duplicate extinguisher id',
      });
    }
    seen.add(extinguisher.id);
  });
});

export type ExtinguisherInspectionPayload = z.infer<typeof extinguisherInspectionSchema>;

export const hydrantSchema = z.object({
  id,
  numero: z.string().trim().min(1).max(200),
  locationId: id.nullish(),
  locationNameSnapshot: z.string().trim().min(1).max(500),
  customLocation: z.boolean(),
  gabinete: checkValue,
  gabinete_comentario: longText,
  senalamiento: checkValue,
  senalamiento_comentario: longText,
  calcomania: checkValue,
  calcomania_comentario: longText,
  valvula_angular: checkValue,
  valvula_angular_comentario: longText,
  manguera: checkValue,
  manguera_comentario: longText,
  chiflon: checkValue,
  chiflon_comentario: longText,
  llave_acople: checkValue,
  llave_acople_comentario: longText,
  observaciones: longText,
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
}).strict().superRefine((hydrant, context) => {
  if (hydrant.customLocation && hydrant.locationId) {
    context.addIssue({
      code: 'custom',
      path: ['locationId'],
      message: 'A custom location cannot include locationId',
    });
  }
});

export const hydrantInspectionSchema = z.object({
  inspectionId: id,
  company: z.object({
    id: id.nullish(),
    name: z.string().trim().min(1).max(200),
  }).strict(),
  branch: z.object({
    id: id.nullish(),
    name: shortText,
  }).strict().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
  technician: z.object({
    id: id.nullish(),
    name: z.string().trim().min(1).max(200),
  }).strict(),
  hydrants: z.array(hydrantSchema).min(1).max(38),
  sourceDeviceId: id.nullish(),
  syncVersion: z.number().int().nonnegative(),
}).strict().superRefine((payload, context) => {
  const seen = new Set<string>();
  payload.hydrants.forEach((hydrant, index) => {
    if (seen.has(hydrant.id)) {
      context.addIssue({
        code: 'custom',
        path: ['hydrants', index, 'id'],
        message: 'Duplicate hydrant id',
      });
    }
    seen.add(hydrant.id);
  });
});

export type HydrantInspectionPayload = z.infer<typeof hydrantInspectionSchema>;

export const inspectionFormatIdSchema = z.enum([
  'jockey', 'diesel', 'electrica', 'tablero_ad', 'dispositivos_ad',
  'dispositivos_convencionales', 'dispositivos_notificacion', 'hidrantes',
  'extintores', 'ansul_r102',
]);

export const evidenceMetadataSchema = z.object({
  evidenceId: z.string().uuid(),
  formatType: z.union([
    inspectionFormatIdSchema,
    z.literal('fire_pumps'),
    z.literal('alarms'),
    z.literal('ansul'),
    z.literal('legacy'),
  ]),
  formType: z.union([z.enum(FIRE_PUMP_FORM_TYPES), z.enum(ALARM_FORM_TYPES)]).nullable().optional(),
  itemId: id.nullable(),
  fieldKey: z.string().trim().min(1).max(200),
  caption: mediumText.nullable(),
  locationNameSnapshot: mediumText.nullable(),
  capturedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const evidenceFinalizeSchema = z.object({
  evidenceIds: z.array(z.string().uuid()).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length) {
    context.addIssue({ code: 'custom', path: ['evidenceIds'], message: 'Duplicate evidence id' });
  }
});

const commonInspectionShape = {
  inspectionId: id,
  company: z.object({ id: id.nullish(), name: z.string().trim().min(1).max(200) }).strict(),
  branch: z.object({ id: id.nullish(), name: shortText }).strict().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
  attention: shortText.default(''),
  area: shortText.default(''),
  technician: z.object({ id: id.nullish(), name: z.string().trim().min(1).max(200) }).strict(),
  sourceDeviceId: id.nullish(),
  syncVersion: z.number().int().nonnegative(),
};

const firePumpAnswerSchema = z.object({
  questionId: id,
  answer: checkValue.optional(),
  parameter: z.union([longText, z.number().finite()]).optional(),
  reading: z.union([longText, z.number().finite()]).optional(),
  comment: longText.optional(),
}).strict().superRefine((answer, context) => {
  if (answer.answer === undefined && answer.parameter === undefined
      && answer.reading === undefined && answer.comment === undefined) {
    context.addIssue({ code: 'custom', message: 'A pump answer must contain a value' });
  }
});

const firePumpFormTypeSchema = z.enum(FIRE_PUMP_FORM_TYPES);
const firePumpFormStatusSchema = z.enum([
  'not_started', 'in_progress', 'complete', 'not_applicable',
]);
const alarmFormStatusSchema = firePumpFormStatusSchema;

const alarmAnswerSchema = z.object({
  questionId: id,
  answer: checkValue.optional(),
  parameter: z.union([longText, z.number().finite()]).optional(),
  reading: z.union([longText, z.number().finite()]).optional(),
  comment: longText.optional(),
}).strict().superRefine((answer, context) => {
  if (!ALARM_PANEL_ALLOWED_IDS.has(answer.questionId)) {
    context.addIssue({ code: 'custom', path: ['questionId'], message: 'Unknown alarm panel questionId' });
  }
  if (answer.answer === undefined && answer.parameter === undefined
      && answer.reading === undefined && answer.comment === undefined) {
    context.addIssue({ code: 'custom', message: 'An alarm answer must contain a value' });
  }
});

const alarmDeviceSchema = z.object({
  id: z.string().uuid(),
  identifier: shortText,
  loop: shortText,
  deviceType: shortText,
  locationId: id.nullable(),
  locationNameSnapshot: mediumText,
  customLocation: z.boolean(),
  alarm: checkValue.or(z.literal('')),
  supervision: checkValue.or(z.literal('')),
  cleaning: checkValue.or(z.literal('')),
  observations: longText,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict().superRefine((item, context) => {
  if (item.customLocation && item.locationId) {
    context.addIssue({ code: 'custom', path: ['locationId'], message: 'A custom location cannot include locationId' });
  }
});

const alarmPanelSchema = z.object({
  formType: z.literal('alarm_panel'),
  status: alarmFormStatusSchema,
  observations: longText,
  updatedAt: z.number().int().nonnegative(),
  answers: z.array(alarmAnswerSchema).max(50),
}).strict().superRefine((form, context) => {
  const ids = new Set<string>();
  form.answers.forEach((answer, index) => {
    if (ids.has(answer.questionId)) {
      context.addIssue({ code: 'custom', path: ['answers', index, 'questionId'], message: 'Duplicate alarm questionId' });
    }
    if (!ALARM_PANEL_ALLOWED_IDS.has(answer.questionId)) {
      context.addIssue({
        code: 'custom',
        path: ['answers', index, 'questionId'],
        message: `Unknown alarm panel questionId ${answer.questionId}`,
      });
    }
    ids.add(answer.questionId);
  });
  if (form.status === 'complete') {
    for (const questionId of ALARM_PANEL_ALLOWED_IDS) {
      if (!form.answers.some((answer) => answer.questionId === questionId && answer.answer)) {
        context.addIssue({ code: 'custom', path: ['answers'], message: `Complete alarm panel is missing ${questionId}` });
      }
    }
  }
});

function alarmDeviceCollectionSchema(formType: typeof ALARM_FORM_TYPES[number]) {
  return z.object({
    formType: z.literal(formType),
    status: alarmFormStatusSchema,
    items: z.array(alarmDeviceSchema).max(MAX_ALARM_DEVICES),
    observations: longText,
    updatedAt: z.number().int().nonnegative(),
  }).strict().superRefine((form, context) => {
    const ids = new Set<string>();
    form.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'Duplicate alarm device id' });
      }
      ids.add(item.id);
      if (form.status === 'complete') {
        for (const [field, value] of [
          ['identifier', item.identifier], ['loop', item.loop], ['deviceType', item.deviceType],
          ['locationNameSnapshot', item.locationNameSnapshot], ['alarm', item.alarm],
          ['supervision', item.supervision], ['cleaning', item.cleaning],
        ]) {
          if (!String(value).trim()) {
            context.addIssue({ code: 'custom', path: ['items', index, field], message: `Complete device is missing ${field}` });
          }
        }
      }
    });
    if (form.status === 'complete' && form.items.length === 0) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'A complete device form requires records' });
    }
  });
}

export const alarmsSchema = z.object({
  systemName: shortText,
  systemNameDiscrepancies: z.array(z.object({ source: shortText, value: shortText }).strict()).max(10),
  panel: alarmPanelSchema,
  addressedDevices: alarmDeviceCollectionSchema('addressed_devices'),
  conventionalDevices: alarmDeviceCollectionSchema('conventional_devices'),
  notificationDevices: alarmDeviceCollectionSchema('notification_devices'),
}).strict().superRefine((alarms, context) => {
  const deviceForms = [alarms.addressedDevices, alarms.conventionalDevices, alarms.notificationDevices];
  if (deviceForms.some((form) => form.status !== 'not_applicable') && !alarms.systemName.trim()) {
    context.addIssue({ code: 'custom', path: ['systemName'], message: 'Alarm system is required when a device form applies' });
  }
  const allIds = new Set<string>();
  deviceForms.forEach((form, formIndex) => form.items.forEach((item, itemIndex) => {
    if (allIds.has(item.id)) {
      context.addIssue({ code: 'custom', path: [formIndex, 'items', itemIndex, 'id'], message: 'Duplicate item id across alarm forms' });
    }
    allIds.add(item.id);
  }));
});

const ansulAnswerSchema = z.object({
  questionId: id,
  answer: checkValue.optional(),
  quantity: z.union([shortText, z.number().finite()]).optional(),
  model: z.union([shortText, z.number().finite()]).optional(),
  comment: longText.optional(),
  legacyParameter: z.union([longText, z.number().finite()]).optional(),
  legacyReading: z.union([longText, z.number().finite()]).optional(),
}).strict().superRefine((answer, context) => {
  if (!ANSUL_ALLOWED_IDS.has(answer.questionId)) {
    context.addIssue({ code: 'custom', path: ['questionId'], message: 'Unknown Ansul questionId' });
  }
  if (answer.answer === undefined && answer.quantity === undefined && answer.model === undefined
      && answer.comment === undefined && answer.legacyParameter === undefined
      && answer.legacyReading === undefined) {
    context.addIssue({ code: 'custom', message: 'An Ansul answer must contain a value' });
  }
});

export const ansulSchema = z.object({
  formType: z.literal(ANSUL_FORMAT_ID),
  status: firePumpFormStatusSchema,
  systemName: shortText,
  capacityGallons: shortText,
  observations: z.string().max(MAX_ANSUL_OBSERVATIONS_LENGTH),
  normalizationIssues: z.array(z.object({
    source: shortText,
    questionId: id.optional(),
    message: mediumText,
  }).strict()).max(50),
  updatedAt: z.number().int().nonnegative(),
  answers: z.array(ansulAnswerSchema).max(17),
}).strict().superRefine((form, context) => {
  const ids = new Set<string>();
  form.answers.forEach((answer, index) => {
    if (ids.has(answer.questionId)) {
      context.addIssue({
        code: 'custom',
        path: ['answers', index, 'questionId'],
        message: 'Duplicate Ansul questionId',
      });
    }
    ids.add(answer.questionId);
  });
  const wrapped = wrapAnsulObservations(form.observations);
  if (!wrapped.valid) {
    context.addIssue({ code: 'custom', path: ['observations'], message: wrapped.message! });
  }
  if (form.status === 'complete') {
    for (const questionId of ANSUL_ALLOWED_IDS) {
      if (!form.answers.some((answer) => answer.questionId === questionId && answer.answer)) {
        context.addIssue({
          code: 'custom',
          path: ['answers'],
          message: `Complete Ansul form is missing answer ${questionId}`,
        });
      }
    }
  }
});

export const firePumpFormSchema = z.object({
  formType: firePumpFormTypeSchema,
  status: firePumpFormStatusSchema,
  observations: longText,
  updatedAt: z.number().int().nonnegative(),
  answers: z.array(firePumpAnswerSchema).max(100),
}).strict().superRefine((form, context) => {
  const seen = new Set<string>();
  const allowed = FIRE_PUMP_ALLOWED_IDS[form.formType];
  form.answers.forEach((answer, index) => {
    if (seen.has(answer.questionId)) {
      context.addIssue({
        code: 'custom',
        path: ['answers', index, 'questionId'],
        message: 'Duplicate pump questionId',
      });
    }
    if (!allowed.has(answer.questionId)) {
      context.addIssue({
        code: 'custom',
        path: ['answers', index, 'questionId'],
        message: `Unknown questionId for ${form.formType}`,
      });
    }
    seen.add(answer.questionId);
  });
  if (form.status === 'complete') {
    const config = FIRE_PUMP_CONFIG[form.formType];
    for (const questionId of Object.keys(config.questions)) {
      if (!form.answers.some((answer) => answer.questionId === questionId && answer.answer)) {
        context.addIssue({
          code: 'custom',
          path: ['answers'],
          message: `Complete form is missing answer ${questionId}`,
        });
      }
    }
    for (const questionId of ['potencia', 'capacidad', 'voltaje']) {
      if (!form.answers.some((answer) => answer.questionId === questionId
          && answer.reading !== undefined && answer.reading !== '')) {
        context.addIssue({
          code: 'custom',
          path: ['answers'],
          message: `Complete form is missing reading ${questionId}`,
        });
      }
    }
  }
});

export const inspectionSyncSchema = z.object({
  ...commonInspectionShape,
  selectedFormatIds: z.array(inspectionFormatIdSchema).min(1),
  extinguishers: z.array(extinguisherSchema).max(115).optional(),
  hydrants: z.array(hydrantSchema).max(38).optional(),
  firePumps: z.array(firePumpFormSchema).max(3).optional(),
  alarms: alarmsSchema.optional(),
  ansul: ansulSchema.optional(),
  signature: inspectionSignatureSchema.nullable().optional(),
  evidenceManifest: z.array(evidenceMetadataSchema).max(100).optional(),
}).strict().superRefine((payload, context) => {
  const selected = new Set(payload.selectedFormatIds);
  if (selected.size !== payload.selectedFormatIds.length) {
    context.addIssue({ code: 'custom', path: ['selectedFormatIds'], message: 'Duplicate format id' });
  }
  for (const [formatId, records] of [
    ['extintores', payload.extinguishers], ['hidrantes', payload.hydrants],
  ] as const) {
    if (selected.has(formatId) && (!records || records.length === 0)) {
      context.addIssue({ code: 'custom', path: [formatId], message: `Selected format ${formatId} requires records` });
    }
    if (!selected.has(formatId) && records !== undefined) {
      context.addIssue({ code: 'custom', path: [formatId], message: `Records supplied for unselected format ${formatId}` });
    }
    const recordIds = new Set<string>();
    records?.forEach((record, index) => {
      if (recordIds.has(record.id)) context.addIssue({
        code: 'custom', path: [formatId, index, 'id'], message: `Duplicate ${formatId} id`,
      });
      recordIds.add(record.id);
    });
  }
  const selectedPumpIds = FIRE_PUMP_MOBILE_IDS.filter((formatId) => selected.has(formatId));
  if (selectedPumpIds.length > 0 && selectedPumpIds.length !== FIRE_PUMP_MOBILE_IDS.length) {
    context.addIssue({
      code: 'custom',
      path: ['selectedFormatIds'],
      message: 'Bombas must include jockey, electrica and diesel',
    });
  }
  if (selectedPumpIds.length === FIRE_PUMP_MOBILE_IDS.length) {
    const forms = payload.firePumps ?? [];
    const formTypes = new Set(forms.map((form) => form.formType));
    if (forms.length !== FIRE_PUMP_FORM_TYPES.length
        || FIRE_PUMP_FORM_TYPES.some((formType) => !formTypes.has(formType))) {
      context.addIssue({
        code: 'custom',
        path: ['firePumps'],
        message: 'Bombas requires one Jockey, Electric and Diesel form',
      });
    }
  } else if (payload.firePumps !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['firePumps'],
      message: 'Pump forms supplied for an unselected format',
    });
  }
  const selectedAlarmIds = ALARM_MOBILE_IDS.filter((formatId) => selected.has(formatId));
  if (selectedAlarmIds.length > 0 && selectedAlarmIds.length !== ALARM_MOBILE_IDS.length) {
    context.addIssue({
      code: 'custom', path: ['selectedFormatIds'],
      message: 'Alarmas must include panel, addressed, conventional and notification forms',
    });
  }
  if (selectedAlarmIds.length === ALARM_MOBILE_IDS.length && !payload.alarms) {
    context.addIssue({ code: 'custom', path: ['alarms'], message: 'Alarmas requires all four forms' });
  } else if (selectedAlarmIds.length === 0 && payload.alarms !== undefined) {
    context.addIssue({ code: 'custom', path: ['alarms'], message: 'Alarm forms supplied for an unselected format' });
  }
  if (selected.has(ANSUL_FORMAT_ID) && !payload.ansul) {
    context.addIssue({ code: 'custom', path: ['ansul'], message: 'Selected Ansul format requires Ansul data' });
  } else if (!selected.has(ANSUL_FORMAT_ID) && payload.ansul !== undefined) {
    context.addIssue({ code: 'custom', path: ['ansul'], message: 'Ansul data supplied for an unselected format' });
  }
  payload.evidenceManifest?.forEach((evidence, index) => {
    const selectedEvidenceFormat = evidence.formatType === 'fire_pumps'
      ? FIRE_PUMP_MOBILE_IDS.every((id) => selected.has(id))
      : evidence.formatType === 'alarms'
        ? ALARM_MOBILE_IDS.every((id) => selected.has(id))
      : evidence.formatType === 'ansul'
        ? selected.has(ANSUL_FORMAT_ID)
      : evidence.formatType === 'legacy' || selected.has(evidence.formatType);
    if (!selectedEvidenceFormat) context.addIssue({
      code: 'custom', path: ['evidenceManifest', index, 'formatType'],
      message: 'Evidence format is not selected for this inspection',
    });
    if (evidence.formatType === 'fire_pumps' && !evidence.formType) context.addIssue({
      code: 'custom', path: ['evidenceManifest', index, 'formType'],
      message: 'Pump evidence requires formType',
    });
    if (evidence.formatType === 'alarms'
        && !ALARM_FORM_TYPES.includes(evidence.formType as typeof ALARM_FORM_TYPES[number])) {
      context.addIssue({
        code: 'custom', path: ['evidenceManifest', index, 'formType'],
        message: 'Alarm evidence requires a valid formType',
      });
    }
  });
});

export type InspectionSyncPayload = z.infer<typeof inspectionSyncSchema>;
