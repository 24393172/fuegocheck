import { Inspection, SiteData } from '../types/inspection.types';

const EMPTY_SITE: SiteData = {
  cliente: '', atencion: '', area: '', fecha: '', tecnico: '',
  companyId: null, companyNameSnapshot: '', branchId: null, branchNameSnapshot: '',
};

// Parses form_data defensively — a corrupted record returns {} instead of crashing.
export function parseFormData(inspection: Inspection): Record<string, unknown> {
  try {
    return JSON.parse(inspection.form_data) as Record<string, unknown>;
  } catch (error) {
    console.error(`[form-data] Corrupted form_data for inspection ${inspection.id}:`, error);
    return {};
  }
}

// Shared site fields (cliente, atención, área, fecha, técnico). Always returns a
// complete object so callers can read fields without extra checks.
export function getSiteData(inspection: Inspection): SiteData {
  const data = parseFormData(inspection);
  // Very old records may have stored these fields at the form-data root.
  const site = ((data.site && typeof data.site === 'object') ? data.site : data) as Partial<SiteData>;
  const merged = { ...EMPTY_SITE, ...site };
  return {
    ...merged,
    companyId: site.companyId || null,
    companyNameSnapshot: site.companyNameSnapshot || merged.cliente || inspection.client_name || '',
    branchId: site.branchId || null,
    branchNameSnapshot: site.branchNameSnapshot || merged.area || '',
  };
}

// One pump's answers (e.g. pumps.jockey). Returns {} if that pump was not touched.
export function getPumpData(inspection: Inspection, pumpId: string): Record<string, unknown> {
  const data = parseFormData(inspection);
  const pumps = (data.pumps ?? {}) as Record<string, Record<string, unknown>>;
  return pumps[pumpId] ?? {};
}

// The date is set automatically in new.tsx and stored in form_data.site.fecha.
export function inspectionDate(inspection: Inspection): string {
  return getSiteData(inspection).fecha;
}
