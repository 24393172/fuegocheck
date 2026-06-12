import { FormSchema } from '../types/form.types';
import { pumpFormV2 } from './pump-form.schema';

const registry: FormSchema[] = [pumpFormV2];

export function getSchema(formType: string, formVersion: number): FormSchema | null {
  return registry.find((s) => s.id === formType && s.version === formVersion) ?? null;
}

export function getAllSchemas(): FormSchema[] {
  return registry;
}

export { pumpFormV2 };
