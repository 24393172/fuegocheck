import { FormSchema } from '../types/form.types';
import { jockeyForm } from './templates/bombas/jockey.schema';
import { electricaForm } from './templates/bombas/electrica.schema';
import { dieselForm } from './templates/bombas/diesel.schema';
import {
  ansulR102Form,
} from './templates/otros/ansul-r102.schema';
import {
  dispositivosAdForm,
  dispositivosConvencionalesForm,
  dispositivosNotificacionForm,
  tableroAdForm,
} from './templates/otros/alarmas.schema';
import { extintoresForm } from './templates/extintores.schema';
import { hidrantesForm } from './templates/hidrantes.schema';

// The three pump forms that make up a site inspection, in the order shown in the
// UI. Each `id` ('jockey' | 'diesel' | 'electrica') is also the key used inside
// the inspection's form_data to store that pump's answers.
export const PUMP_SCHEMAS: FormSchema[] = [jockeyForm, dieselForm, electricaForm]
  .map((schema) => ({ ...schema, templateType: 'pump' as const }));
export const ADDITIONAL_SCHEMAS: FormSchema[] = [
  { ...tableroAdForm, templateType: 'alarm' },
  { ...dispositivosAdForm, templateType: 'alarm' },
  { ...dispositivosConvencionalesForm, templateType: 'alarm' },
  { ...dispositivosNotificacionForm, templateType: 'alarm' },
  { ...hidrantesForm, templateType: 'hydrant' },
  { ...extintoresForm, templateType: 'extinguisher' },
  { ...ansulR102Form, templateType: 'suppression' },
];
export const INSPECTION_SCHEMAS: FormSchema[] = [...PUMP_SCHEMAS, ...ADDITIONAL_SCHEMAS];

const registry: FormSchema[] = [...INSPECTION_SCHEMAS];

export function getSchema(formType: string, formVersion: number): FormSchema | null {
  return registry.find((s) => s.id === formType && s.version === formVersion) ?? null;
}

export function getAllSchemas(): FormSchema[] {
  return registry;
}

export {
  ansulR102Form,
  dieselForm,
  dispositivosAdForm,
  dispositivosConvencionalesForm,
  dispositivosNotificacionForm,
  electricaForm,
  extintoresForm,
  hidrantesForm,
  jockeyForm,
  tableroAdForm,
};
