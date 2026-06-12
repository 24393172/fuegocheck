import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { getInspection, getAllInspections } from './repositories/inspections.repo';
import { getSchema, pumpFormV2 } from '../schemas';
import { Inspection, InspectionStatus } from '../types/inspection.types';

function yesNoNaLabel(value: unknown): string {
  if (value === 'si') return 'Sí';
  if (value === 'no') return 'No';
  if (value === 'na') return 'N/A';
  return '';
}

const STATUS_LABEL: Record<InspectionStatus, string> = {
  draft: 'Borrador',
  completed: 'Por enviar',
  sent: 'Enviada',
};

// Returns a value ready for an Excel cell. Numbers are returned as real numbers
// (so the secretary can sum/average them); everything else as a string.
function cellValue(type: string, value: unknown): string | number {
  if (value === undefined || value === null || value === '') return '';
  if (type === 'yes_no_na') return yesNoNaLabel(value);
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  return String(value);
}

// Parses form_data defensively — a corrupted record returns {} instead of crashing.
function parseFormData(inspection: Inspection): Record<string, unknown> {
  try {
    return JSON.parse(inspection.form_data) as Record<string, unknown>;
  } catch (error) {
    console.error(`[excel] Corrupted form_data for inspection ${inspection.id}:`, error);
    return {};
  }
}

function writeWorkbook(wb: XLSX.WorkBook, fileName: string): Promise<string> {
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  return FileSystem.writeAsStringAsync(filePath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  }).then(() => filePath);
}

// ─── Single inspection (vertical layout: one row per field) ────────────────────

export async function generateInspectionExcel(inspectionId: string): Promise<string> {
  const inspection = await getInspection(inspectionId);
  if (!inspection) throw new Error(`Inspection ${inspectionId} not found`);

  const schema = getSchema(inspection.form_type, inspection.form_version);
  if (!schema) throw new Error(`Schema not found for ${inspection.form_type} v${inspection.form_version}`);

  const formData = parseFormData(inspection);
  const rows: (string | number)[][] = [];

  rows.push(['Fuego & Seguridad']);
  rows.push([schema.name]);
  rows.push([]);

  const date = String(formData['fecha'] ?? formData['inspection_date'] ?? '');

  rows.push(['Cliente', inspection.client_name]);
  rows.push(['Fecha', date]);
  rows.push(['Técnico', inspection.technician_name]);
  rows.push(['Ubicación', inspection.location]);
  rows.push([]);

  const SKIP_SECTIONS = new Set(['firmas', 'firma', 'evidencia_fotografica']);

  for (const section of schema.sections) {
    if (SKIP_SECTIONS.has(section.id)) continue;
    rows.push([section.title]);
    for (const field of section.fields) {
      if (field.type === 'photo' || field.type === 'signature') continue;
      rows.push([field.label, cellValue(field.type, formData[field.key])]);
      const comment = formData[field.key + '_comentario'];
      if (comment && String(comment).trim()) {
        rows.push(['  ↳ Comentario', String(comment)]);
      }
    }
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 50 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inspección');

  const safeClient = inspection.client_name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const fileName = `inspeccion_${safeClient}_${inspectionId.slice(0, 8)}.xlsx`;
  return writeWorkbook(wb, fileName);
}

// ─── All inspections (master sheet: one row per inspection) ────────────────────
// Used by the "Exportar todo" button in Settings so the company can consolidate.

export async function generateMasterExcel(): Promise<{ filePath: string; count: number }> {
  const inspections = await getAllInspections();

  // Columns: fixed metadata + every non-media field of the pump form.
  const fieldCols = pumpFormV2.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.type !== 'photo' && f.type !== 'signature');

  const header = ['Fecha', 'Cliente', 'Técnico', 'Ubicación', 'Estado', ...fieldCols.map((f) => f.label)];
  const rows: (string | number)[][] = [header];

  for (const insp of inspections) {
    const formData = parseFormData(insp);
    const date = String(formData['fecha'] ?? formData['inspection_date'] ?? '');
    const row: (string | number)[] = [
      date,
      insp.client_name,
      insp.technician_name,
      insp.location,
      STATUS_LABEL[insp.status] ?? insp.status,
    ];
    for (const field of fieldCols) {
      row.push(cellValue(field.type, formData[field.key]));
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Reasonable widths: metadata wide, field columns medium.
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 12 },
    ...fieldCols.map(() => ({ wch: 18 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inspecciones');

  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = await writeWorkbook(wb, `inspecciones_${stamp}.xlsx`);
  return { filePath, count: inspections.length };
}
