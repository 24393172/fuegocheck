import { ADDITIONAL_SCHEMAS, INSPECTION_SCHEMAS, PUMP_SCHEMAS } from '../schemas';
import { FormSchema } from '../types/form.types';

export const PUMPS_FORMAT_ID = 'bombas';

export interface InspectionFormatOption {
  id: string;
  name: string;
  description: string;
  schemaIds: string[];
  templateType: FormSchema['templateType'];
}

export const INSPECTION_FORMAT_OPTIONS: InspectionFormatOption[] = [
  {
    id: PUMPS_FORMAT_ID,
    name: 'Bombas contra incendio',
    description: 'Jockey, diésel y eléctrica',
    schemaIds: PUMP_SCHEMAS.map((schema) => schema.id),
    templateType: 'pump',
  },
  ...ADDITIONAL_SCHEMAS.map((schema) => ({
    id: schema.id,
    name: schema.name,
    description: schema.templateType === 'alarm'
      ? 'Sistema de alarma y detección'
      : 'Formato de inspección',
    schemaIds: [schema.id],
    templateType: schema.templateType,
  })),
];

const VALID_SCHEMA_IDS = new Set(INSPECTION_SCHEMAS.map((schema) => schema.id));
const PUMP_SCHEMA_IDS = PUMP_SCHEMAS.map((schema) => schema.id);

// Legacy site inspections did not store selectedFormatIds because they always
// contained the three pump forms. Any pump member is normalized to the complete
// group so Bombas remains an atomic option.
export function normalizeSelectedFormatIds(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && VALID_SCHEMA_IDS.has(item))
    : [];

  if (raw.length === 0) return [...PUMP_SCHEMA_IDS];

  const unique = [...new Set(raw)];
  if (unique.some((id) => PUMP_SCHEMA_IDS.includes(id))) {
    return [
      ...PUMP_SCHEMA_IDS,
      ...unique.filter((id) => !PUMP_SCHEMA_IDS.includes(id)),
    ];
  }
  return unique;
}

export function schemasForSelectedFormatIds(selectedFormatIds: string[]): FormSchema[] {
  return INSPECTION_SCHEMAS.filter((schema) => selectedFormatIds.includes(schema.id));
}

export function isFormatAlreadyAdded(
  option: InspectionFormatOption,
  selectedFormatIds: string[]
): boolean {
  return option.schemaIds.every((id) => selectedFormatIds.includes(id));
}

