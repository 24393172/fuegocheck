import { z } from 'zod';

export const uuidSchema = z.string().uuid();
const requiredName = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(500).default('');

export const companyInputSchema = z.object({
  name: requiredName,
  businessName: z.string().trim().max(240).default(''),
  active: z.boolean().default(true),
}).strict();

export const branchInputSchema = z.object({
  name: requiredName,
  address: optionalText,
  active: z.boolean().default(true),
}).strict();

export const equipmentTypeSchema = z.enum([
  'extinguisher',
  'hydrant',
  'addressed_device',
  'conventional_device',
  'notification_device',
]);

const standardEquipmentTypeSchema = z.enum([
  'hydrant',
  'addressed_device',
  'conventional_device',
  'notification_device',
]);

const extinguisherLocationInputSchema = z.object({
  equipmentType: z.literal('extinguisher'),
  name: requiredName,
  identifier: z.string().trim().max(160).default(''),
  extinguisherType: z.string().trim().max(160).default(''),
  capacity: z.string().trim().max(160).default(''),
  active: z.boolean().default(true),
}).strict();

const standardLocationInputSchema = z.object({
  branchId: uuidSchema.nullable().default(null),
  equipmentType: standardEquipmentTypeSchema,
  name: requiredName,
  area: optionalText,
  floor: z.string().trim().max(120).default(''),
  reference: optionalText,
  active: z.boolean().default(true),
}).strict();

export const locationInputSchema = z.discriminatedUnion('equipmentType', [
  extinguisherLocationInputSchema,
  standardLocationInputSchema,
]);

export const statusInputSchema = z.object({ active: z.boolean() }).strict();

export type CompanyInput = z.infer<typeof companyInputSchema>;
export type BranchInput = z.infer<typeof branchInputSchema>;
export type LocationInput = z.infer<typeof locationInputSchema>;
export type EquipmentType = z.infer<typeof equipmentTypeSchema>;
