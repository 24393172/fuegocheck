// Import xlsx's prebuilt standalone bundle, NOT the package entry point. The
// entry ("xlsx.js") does require('fs' / 'crypto' / 'stream'), which Metro/Hermes
// fails to resolve in Expo Go ("Requiring unknown module 1766"). The dist bundle
// is self-contained and loads in both Expo Go and the APK.
import * as XLSX from 'xlsx/dist/xlsx.full.min.js';
import * as FileSystem from 'expo-file-system/legacy';
import { getInspection, getAllInspections } from './repositories/inspections.repo';
import { PUMP_SCHEMAS } from '../schemas';
import { FormSchema, FormField } from '../types/form.types';
import { InspectionStatus } from '../types/inspection.types';
import { parseFormData, getSiteData } from './form-data';

// Short, Excel-safe sheet names (max 31 chars, no : \ / ? * [ ]).
const SHEET_NAME: Record<string, string> = {
  jockey: 'Jockey',
  diesel: 'Diésel',
  electrica: 'Eléctrica',
};

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

function writeWorkbook(
  wb: XLSX.WorkBook,
  fileName: string
): Promise<string> {
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  return FileSystem.writeAsStringAsync(filePath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  }).then(() => filePath);
}

// True if a pump has at least one answered/filled field (so it goes in the report).
function pumpHasData(schema: FormSchema, data: Record<string, unknown>): boolean {
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const v = data[field.key];
      if (v !== undefined && v !== null && v !== '') return true;
    }
  }
  return false;
}

// Builds the "Lecturas" column text for a question that has readings attached,
// e.g. "Presión de Arranque (PSI): 90  /  Presión de Paro (PSI): 110".
function readingsText(
  field: FormField,
  sectionFields: FormField[],
  data: Record<string, unknown>
): string {
  if (!field.readingKeys || field.readingKeys.length === 0) return '';
  const parts: string[] = [];
  for (const rk of field.readingKeys) {
    const v = data[rk];
    if (v === undefined || v === null || v === '') continue;
    const rf = sectionFields.find((f) => f.key === rk);
    parts.push(`${rf ? rf.label : rk}: ${v}`);
  }
  return parts.join('  /  ');
}

// ─── One pump = one sheet, laid out like the paper form ────────────────────────
// Columns: Pregunta | S | N/A | N | Parámetros | Lecturas | Comentarios
function buildPumpSheet(
  schema: FormSchema,
  site: ReturnType<typeof getSiteData>,
  data: Record<string, unknown>
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  rows.push(['Fuego & Seguridad']);
  rows.push(['Reporte de Inspección, Pruebas y Mantenimiento']);
  rows.push([schema.name]);
  rows.push([]);

  // Header block as single-cell "label: value" lines. Keeping each on one cell
  // avoids column-alignment issues and lets long values overflow cleanly.
  const pumpField = (key: string) => String(data[key] ?? '');
  rows.push([`Cliente: ${site.cliente}`]);
  rows.push([`Atención: ${site.atencion}`]);
  rows.push([`Área: ${site.area}`]);
  rows.push([`Fecha: ${site.fecha}`]);
  rows.push([`Potencia (HP): ${pumpField('potencia')}`]);
  rows.push([`Capacidad: ${pumpField('capacidad')}`]);
  rows.push([`Voltaje de operación: ${pumpField('voltaje')}`]);
  rows.push([]);

  // Table header. Column 1 is an empty spacer so long questions don't run
  // visually into the S / N/A / N columns.
  rows.push(['Pregunta', '', 'S', 'N/A', 'N', 'Parámetros', 'Lecturas', 'Comentarios']);

  for (const section of schema.sections) {
    // Header data goes above; photos never go in the Excel; observations go last.
    if (section.id === 'datos_bomba' || section.id === 'evidencia_fotografica' || section.id === 'observaciones') {
      continue;
    }

    rows.push([section.title]);

    // Keys that are readings of some question in this section — they are shown
    // inside that question's row, not as their own rows.
    const readingKeysInSection = new Set(
      section.fields.flatMap((f) => f.readingKeys ?? [])
    );

    for (const field of section.fields) {
      if (field.type !== 'yes_no_na') continue;
      if (readingKeysInSection.has(field.key)) continue;

      const answer = data[field.key];
      const comment = data[field.key + '_comentario'];
      rows.push([
        field.label,
        '',
        answer === 'si' ? 'X' : '',
        answer === 'na' ? 'X' : '',
        answer === 'no' ? 'X' : '',
        field.parametro ?? '',
        readingsText(field, section.fields, data),
        comment && String(comment).trim() ? String(comment) : '',
      ]);
    }
  }

  // Observations.
  const obsField = schema.sections
    .find((s) => s.id === 'observaciones')
    ?.fields[0];
  if (obsField) {
    const obs = data[obsField.key];
    rows.push([]);
    rows.push(['Observaciones']);
    rows.push([obs ? String(obs) : '']);
  }

  rows.push([]);
  rows.push([`Inspeccionado por Fuego & Seguridad — ${site.fecha}`]);

  return rows;
}

const PUMP_SHEET_COLS = [
  { wch: 72 }, { wch: 4 }, { wch: 5 }, { wch: 6 }, { wch: 5 }, { wch: 16 }, { wch: 30 }, { wch: 30 },
];

// ─── Single inspection: one sheet per pump that has data, in the same workbook ──

export async function generateInspectionExcel(inspectionId: string): Promise<string> {
  const inspection = await getInspection(inspectionId);
  if (!inspection) throw new Error(`Inspection ${inspectionId} not found`);

  const fullData = parseFormData(inspection);
  const pumps = (fullData.pumps ?? {}) as Record<string, Record<string, unknown>>;
  const site = getSiteData(inspection);

  const wb = XLSX.utils.book_new();

  let added = 0;
  for (const schema of PUMP_SCHEMAS) {
    const data = pumps[schema.id] ?? {};
    if (!pumpHasData(schema, data)) continue;
    const ws = XLSX.utils.aoa_to_sheet(buildPumpSheet(schema, site, data));
    ws['!cols'] = PUMP_SHEET_COLS;
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME[schema.id] ?? schema.id);
    added++;
  }

  // Safety net: an empty workbook can't be written. Should not happen because the
  // index screen requires at least one pump with data before sharing.
  if (added === 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Fuego & Seguridad'],
      ['Cliente', site.cliente],
      ['Área', site.area],
      ['Fecha', site.fecha],
      ['(Sin bombas con datos)'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inspección');
  }

  const safeClient = inspection.client_name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const fileName = `inspeccion_${safeClient}_${inspectionId.slice(0, 8)}.xlsx`;
  return writeWorkbook(wb, fileName);
}

// ─── All inspections (master): one sheet per pump type, one row per inspection ──
// Used by the "Exportar todo" button in Settings so the company can consolidate.

export async function generateMasterExcel(): Promise<{ filePath: string; count: number }> {
  const inspections = await getAllInspections();

  const wb = XLSX.utils.book_new();

  for (const schema of PUMP_SCHEMAS) {
    const fieldCols = schema.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.type !== 'photo' && f.type !== 'signature');

    const header = [
      'Fecha', 'Cliente', 'Atención', 'Área', 'Técnico', 'Estado',
      ...fieldCols.map((f) => f.label),
    ];
    const rows: (string | number)[][] = [header];

    for (const insp of inspections) {
      const fullData = parseFormData(insp);
      const pumps = (fullData.pumps ?? {}) as Record<string, Record<string, unknown>>;
      const data = pumps[schema.id];
      if (!data || !pumpHasData(schema, data)) continue;

      const site = getSiteData(insp);
      const row: (string | number)[] = [
        site.fecha, site.cliente, site.atencion, site.area, site.tecnico,
        STATUS_LABEL[insp.status] ?? insp.status,
      ];
      for (const field of fieldCols) row.push(cellValue(field.type, data[field.key]));
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 },
      ...fieldCols.map(() => ({ wch: 18 })),
    ];
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME[schema.id] ?? schema.id);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = await writeWorkbook(wb, `inspecciones_${stamp}.xlsx`);
  return { filePath, count: inspections.length };
}
