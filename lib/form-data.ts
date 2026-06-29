import { Inspection } from '../types/inspection.types';

// Parses form_data defensively — a corrupted record returns {} instead of crashing.
export function parseFormData(inspection: Inspection): Record<string, unknown> {
  try {
    return JSON.parse(inspection.form_data) as Record<string, unknown>;
  } catch (error) {
    console.error(`[form-data] Corrupted form_data for inspection ${inspection.id}:`, error);
    return {};
  }
}

// The date is set automatically in new.tsx and stored inside form_data.
export function inspectionDate(inspection: Inspection): string {
  const formData = parseFormData(inspection);
  return String(formData['fecha'] ?? '');
}
