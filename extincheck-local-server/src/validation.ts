import { z } from 'zod';

const id = z.string().trim().min(1).max(128);
const shortText = z.string().trim().max(200);
const mediumText = z.string().trim().max(500);
const longText = z.string().trim().max(2000);
const checkValue = z.enum(['si', 'no', 'na']);

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

const commonInspectionShape = {
  inspectionId: id,
  company: z.object({ id: id.nullish(), name: z.string().trim().min(1).max(200) }).strict(),
  branch: z.object({ id: id.nullish(), name: shortText }).strict().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
  technician: z.object({ id: id.nullish(), name: z.string().trim().min(1).max(200) }).strict(),
  sourceDeviceId: id.nullish(),
  syncVersion: z.number().int().nonnegative(),
};

export const inspectionSyncSchema = z.object({
  ...commonInspectionShape,
  selectedFormatIds: z.array(inspectionFormatIdSchema).min(1),
  extinguishers: z.array(extinguisherSchema).max(115).optional(),
  hydrants: z.array(hydrantSchema).max(38).optional(),
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
});

export type InspectionSyncPayload = z.infer<typeof inspectionSyncSchema>;
