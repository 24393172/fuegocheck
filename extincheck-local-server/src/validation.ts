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

