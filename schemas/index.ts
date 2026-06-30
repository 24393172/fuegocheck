import { FormSchema } from '../types/form.types';
import { jockeyForm } from './jockey-form.schema';
import { electricaForm } from './electrica-form.schema';
import { dieselForm } from './diesel-form.schema';

// The three pump forms that make up a site inspection, in the order shown in the
// UI. Each `id` ('jockey' | 'diesel' | 'electrica') is also the key used inside
// the inspection's form_data to store that pump's answers.
export const PUMP_SCHEMAS: FormSchema[] = [jockeyForm, dieselForm, electricaForm];

const registry: FormSchema[] = [...PUMP_SCHEMAS];

export function getSchema(formType: string, formVersion: number): FormSchema | null {
  return registry.find((s) => s.id === formType && s.version === formVersion) ?? null;
}

export function getAllSchemas(): FormSchema[] {
  return registry;
}

export { jockeyForm, electricaForm, dieselForm };
