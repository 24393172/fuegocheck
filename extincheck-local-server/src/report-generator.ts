import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { GeneratedReport, InspectionReportData, LocalDatabase } from './database.js';

const FORMAT_TYPE = 'inspection';
const TEMPLATE_VERSION = 'cancun-extinguishers-hydrants-v2';

const EXTINGUISHER_RANGE = { firstRow: 14, lastRow: 128, firstColumn: 1, lastColumn: 35 };
const HYDRANT_RANGE = { firstRow: 13, lastRow: 50, firstColumn: 1, lastColumn: 35 };

type CleanupRange = { firstRow: number; lastRow: number; firstColumn: number; lastColumn: number };
type SheetCleanup = { cells: readonly string[]; ranges: readonly CleanupRange[] };

// Only variable capture areas are cleared. Fixed questions, labels, styles,
// drawings, merged cells and print settings remain untouched in the template.
export const SHEET_CLEANUP_CONFIG: Readonly<Record<string, SheetCleanup>> = {
  'Tablero A&D': { cells: ['F9', 'F10', 'F11', 'F12'], ranges: [
    { firstRow: 18, lastRow: 46, firstColumn: 17, lastColumn: 22 },
    { firstRow: 18, lastRow: 46, firstColumn: 27, lastColumn: 36 },
    { firstRow: 49, lastRow: 57, firstColumn: 1, lastColumn: 36 },
  ] },
  'Dispositivos A&D': { cells: ['F9', 'F10', 'F11'], ranges: [
    { firstRow: 17, lastRow: 37, firstColumn: 1, lastColumn: 38 },
    { firstRow: 39, lastRow: 40, firstColumn: 1, lastColumn: 38 },
  ] },
  'Dispositivos Convencionales': { cells: ['F9', 'F10', 'F11'], ranges: [
    { firstRow: 17, lastRow: 37, firstColumn: 1, lastColumn: 38 },
    { firstRow: 39, lastRow: 40, firstColumn: 1, lastColumn: 38 },
  ] },
  'Dispositivos Notificacion': { cells: ['F9', 'F10', 'F11'], ranges: [
    { firstRow: 17, lastRow: 37, firstColumn: 1, lastColumn: 38 },
    { firstRow: 39, lastRow: 40, firstColumn: 1, lastColumn: 38 },
  ] },
  'B Jockey': { cells: ['F9', 'F10', 'F11', 'F12', 'AI10', 'AI11', 'AI12'], ranges: [
    { firstRow: 17, lastRow: 52, firstColumn: 17, lastColumn: 22 },
    { firstRow: 17, lastRow: 52, firstColumn: 27, lastColumn: 37 },
    { firstRow: 55, lastRow: 56, firstColumn: 1, lastColumn: 37 },
  ] },
  'B Electrica': { cells: ['F9', 'F10', 'F11', 'F12', 'AI10', 'AI11', 'AI12'], ranges: [
    { firstRow: 17, lastRow: 57, firstColumn: 17, lastColumn: 22 },
    { firstRow: 17, lastRow: 57, firstColumn: 27, lastColumn: 37 },
    { firstRow: 60, lastRow: 61, firstColumn: 1, lastColumn: 37 },
  ] },
  'B Diesel': { cells: ['F9', 'F10', 'F11', 'F12', 'AH10', 'AH11', 'AH12'], ranges: [
    { firstRow: 17, lastRow: 80, firstColumn: 17, lastColumn: 22 },
    { firstRow: 17, lastRow: 80, firstColumn: 27, lastColumn: 37 },
    { firstRow: 83, lastRow: 88, firstColumn: 1, lastColumn: 37 },
  ] },
  HIDRANTES: { cells: ['F8', 'F9', 'F10'], ranges: [HYDRANT_RANGE] },
  EXTINTORES: { cells: ['F9', 'F10', 'F11'], ranges: [EXTINGUISHER_RANGE] },
  'Ansul R-102': { cells: ['F9', 'F10', 'F11', 'F12'], ranges: [
    { firstRow: 17, lastRow: 33, firstColumn: 17, lastColumn: 22 },
    { firstRow: 17, lastRow: 33, firstColumn: 23, lastColumn: 36 },
    { firstRow: 36, lastRow: 44, firstColumn: 1, lastColumn: 39 },
  ] },
};

const EXTINGUISHER_COLUMNS = {
  numero: 'A', ubicacion: 'C', tipo_extintor: 'L', capacidad: 'O', proxima_recarga: 'Q',
  presion: 'R', altura: 'U', seguro: 'W', pintura: 'Y', manguera: 'AA', difusor: 'AC',
  senalamiento: 'AE', observaciones: 'AG',
} as const;

const HYDRANT_COLUMNS = {
  numero: 'A', ubicacion: 'C', gabinete: 'L', senalamiento: 'O', calcomania: 'Q',
  valvula_angular: 'R', manguera: 'U', chiflon: 'W', llave_acople: 'AA', observaciones: 'AD',
} as const;

type CheckValue = 'si' | 'no' | 'na';

export function inspectionCheckValue(value: CheckValue): string {
  return { si: 'Sí', no: 'No', na: 'N/A' }[value];
}

export function sanitizeFilenamePart(value: string, fallback: string): string {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/[^a-zA-Z0-9._ -]/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (sanitized || fallback).slice(0, 80);
}

function shortInspectionId(inspectionId: string): string {
  return sanitizeFilenamePart(inspectionId, 'inspeccion').replace(/\s/g, '_').slice(0, 12);
}

function extinguisherComments(item: InspectionReportData['extinguishers'][number]): string {
  return joinedComments(item.observaciones, [
    ['Presión', item.presion_comentario],
    ['Altura', item.altura_comentario],
    ['Seguro', item.seguro_comentario],
    ['Pintura', item.pintura_comentario],
    ['Manguera', item.manguera_comentario],
    ['Difusor', item.difusor_comentario],
    ['Señalamiento', item.senalamiento_comentario],
  ]);
}

function hydrantComments(item: InspectionReportData['hydrants'][number]): string {
  return joinedComments(item.observaciones, [
    ['Gabinete', item.gabinete_comentario],
    ['Señalamiento', item.senalamiento_comentario],
    ['Calcomanía', item.calcomania_comentario],
    ['Válvula angular', item.valvula_angular_comentario],
    ['Manguera', item.manguera_comentario],
    ['Chiflón', item.chiflon_comentario],
    ['Llave de acople', item.llave_acople_comentario],
  ]);
}

function joinedComments(general: string, entries: Array<[string, string]>): string {
  const paragraphs: string[] = [];
  if (general.trim()) paragraphs.push(general.trim());
  for (const [label, comment] of entries) {
    if (comment.trim()) paragraphs.push(`${label}: ${comment.trim()}`);
  }
  return paragraphs.join('\n');
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function columnNumber(address: string): number {
  const letters = /^([A-Z]+)/.exec(address)?.[1] ?? '';
  return [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
}

function rowNumber(address: string): number {
  return Number(/(\d+)$/.exec(address)?.[1] ?? 0);
}

function cellWithValue(cellXml: string, sharedStringIndex: number | null): string {
  const openingTag = /^<c\b[^>]*\/?\s*>/.exec(cellXml)?.[0];
  if (!openingTag) throw new Error('Invalid worksheet cell XML');
  const attributes = openingTag.slice(2, openingTag.length - 1).replace(/\/\s*$/, '')
    .replace(/\s+t=(?:"[^"]*"|'[^']*')/g, '');
  if (sharedStringIndex === null) return `<c${attributes}/>`;
  return `<c${attributes} t="s"><v>${sharedStringIndex}</v></c>`;
}

class SharedStringWriter {
  private readonly added = new Map<string, number>();
  private nextIndex: number;

  constructor(public xml: string) {
    const entries = [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)];
    entries.forEach((entry, index) => {
      const value = [...entry[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((match) => xmlUnescape(match[1])).join('');
      if (!this.added.has(value)) this.added.set(value, index);
    });
    this.nextIndex = entries.length;
    this.xml = this.xml.replace(/\s+(?:count|uniqueCount)="\d+"/g, '');
  }

  add(value: string): number {
    const existing = this.added.get(value);
    if (existing !== undefined) return existing;
    const index = this.nextIndex++;
    this.added.set(value, index);
    this.xml = this.xml.replace('</sst>', `<si><t xml:space="preserve">${xmlEscape(value)}</t></si></sst>`);
    return index;
  }

  finalize(referenceCount: number): string {
    return this.xml.replace(/<sst\b/, `<sst count="${referenceCount}" uniqueCount="${this.nextIndex}"`);
  }
}

function clearInspectionCells(
  sheetXml: string,
  ranges: readonly CleanupRange[],
  generalCells: readonly string[]
): string {
  const general = new Set(generalCells);
  return sheetXml.replace(
    /<c\b(?=[^>]*\br=(?:"[A-Z]+\d+"|'[A-Z]+\d+'))[^>]*?\/>|<c\b(?=[^>]*\br=(?:"[A-Z]+\d+"|'[A-Z]+\d+'))[^>]*>[\s\S]*?<\/c>/g,
    (cellXml) => {
      const address = /\br=(?:"([A-Z]+\d+)"|'([A-Z]+\d+)')/.exec(cellXml)?.slice(1).find(Boolean);
      if (!address) return cellXml;
      const row = rowNumber(address);
      const column = columnNumber(address);
      const inside = ranges.some((range) => row >= range.firstRow && row <= range.lastRow
        && column >= range.firstColumn && column <= range.lastColumn);
      return inside || general.has(address) ? cellWithValue(cellXml, null) : cellXml;
    }
  );
}

function writeCell(sheetXml: string, address: string, value: string, strings: SharedStringWriter): string {
  const expression = new RegExp(
    `<c\\b(?=[^>]*\\br=(?:"${address}"|'${address}'))[^>]*?\\/>|` +
    `<c\\b(?=[^>]*\\br=(?:"${address}"|'${address}'))[^>]*>[\\s\\S]*?<\\/c>`
  );
  if (!expression.test(sheetXml)) throw new Error(`Template cell ${address} was not found`);
  return sheetXml.replace(expression, (cellXml) => cellWithValue(cellXml, strings.add(value)));
}

async function worksheetPath(zip: JSZip, sheetName: string): Promise<string> {
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relationshipsXml) throw new Error('Invalid XLSX workbook structure');
  const escapedName = xmlEscape(sheetName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sheetTag = workbookXml.match(new RegExp(`<sheet\\b(?=[^>]*\\bname="${escapedName}")[^>]*>`))?.[0];
  const relationshipId = sheetTag?.match(/\br:id="([^"]+)"/)?.[1];
  if (!relationshipId) throw new Error(`Worksheet ${sheetName} was not found in the template`);
  const escapedId = relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relationshipTag = relationshipsXml.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapedId}")[^>]*/>`))?.[0];
  const target = relationshipTag?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error(`Worksheet ${sheetName} relationship is invalid`);
  const normalized = target.replace(/^\//, '').replace(/\\/g, '/');
  return normalized.startsWith('xl/') ? normalized : `xl/${normalized}`;
}

export class ExtinguisherReportService {
  constructor(
    private readonly database: LocalDatabase,
    public readonly templatePath: string,
    public readonly reportsDirectory: string
  ) {
    fs.mkdirSync(this.reportsDirectory, { recursive: true });
  }

  async generate(inspectionId: string, options: { recordFailure?: boolean } = {}): Promise<GeneratedReport> {
    const generatedAt = new Date().toISOString();
    const data = this.database.getInspectionReportData(inspectionId);
    if (!data) throw new Error(`Inspection not found: ${inspectionId}`);
    const includesExtinguishers = data.inspection.selectedFormatIds.includes('extintores');
    const includesHydrants = data.inspection.selectedFormatIds.includes('hidrantes');
    if (!includesExtinguishers && !includesHydrants) throw new Error('Inspection has no supported formats');
    if (data.extinguishers.length > 115) throw new Error('A report cannot contain more than 115 extinguishers');
    if (data.hydrants.length > 38) throw new Error('A report cannot contain more than 38 hydrants');

    const previous = this.database.getReportForInspection(inspectionId, FORMAT_TYPE);
    const filename = this.availableFilename(data, previous);
    const targetPath = path.join(this.reportsDirectory, filename);
    const temporaryPath = path.join(this.reportsDirectory, `.${randomUUID()}.tmp`);

    try {
      if (!fs.existsSync(this.templatePath)) throw new Error(`Inspection template not found: ${this.templatePath}`);
      const zip = await JSZip.loadAsync(await fs.promises.readFile(this.templatePath));
      const sharedStringsFile = zip.file('xl/sharedStrings.xml');
      if (!sharedStringsFile) throw new Error('Template shared strings were not found');
      const strings = new SharedStringWriter(await sharedStringsFile.async('string'));

      const cleanedSheets = new Map<string, string>();
      for (const [sheetName, cleanup] of Object.entries(SHEET_CLEANUP_CONFIG)) {
        let sheetPath: string;
        try {
          sheetPath = await worksheetPath(zip, sheetName);
        } catch (error) {
          // Small test/custom templates may omit formats. Selected supported
          // sheets are resolved below and still remain mandatory.
          if (error instanceof Error && error.message.includes('was not found')) continue;
          throw error;
        }
        const sheetFile = zip.file(sheetPath);
        if (!sheetFile) throw new Error(`Worksheet XML was not found: ${sheetName}`);
        cleanedSheets.set(sheetPath, clearInspectionCells(
          await sheetFile.async('string'), cleanup.ranges, cleanup.cells
        ));
      }
      const extPath = await worksheetPath(zip, 'EXTINTORES');
      const hydPath = await worksheetPath(zip, 'HIDRANTES');
      let extXml = cleanedSheets.get(extPath)!;
      let hydXml = cleanedSheets.get(hydPath)!;

      if (includesExtinguishers) {
        extXml = writeCell(extXml, 'F9', data.inspection.companyName, strings);
        extXml = writeCell(extXml, 'F10', 'EXTINTORES', strings);
        extXml = writeCell(extXml, 'F11', data.inspection.inspectionDate, strings);
        data.extinguishers.forEach((item, index) => {
          const row = EXTINGUISHER_RANGE.firstRow + index;
          for (const [column, value] of [
            [EXTINGUISHER_COLUMNS.numero, item.numero], [EXTINGUISHER_COLUMNS.ubicacion, item.ubicacion],
            [EXTINGUISHER_COLUMNS.tipo_extintor, item.tipo_extintor], [EXTINGUISHER_COLUMNS.capacidad, item.capacidad],
            [EXTINGUISHER_COLUMNS.proxima_recarga, item.proxima_recarga],
            [EXTINGUISHER_COLUMNS.presion, inspectionCheckValue(item.presion)],
            [EXTINGUISHER_COLUMNS.altura, inspectionCheckValue(item.altura)],
            [EXTINGUISHER_COLUMNS.seguro, inspectionCheckValue(item.seguro)],
            [EXTINGUISHER_COLUMNS.pintura, inspectionCheckValue(item.pintura)],
            [EXTINGUISHER_COLUMNS.manguera, inspectionCheckValue(item.manguera)],
            [EXTINGUISHER_COLUMNS.difusor, inspectionCheckValue(item.difusor)],
            [EXTINGUISHER_COLUMNS.senalamiento, inspectionCheckValue(item.senalamiento)],
            [EXTINGUISHER_COLUMNS.observaciones, extinguisherComments(item)],
          ] as Array<[string, string]>) extXml = writeCell(extXml, `${column}${row}`, value, strings);
        });
      }

      if (includesHydrants) {
        hydXml = writeCell(hydXml, 'F8', data.inspection.companyName, strings);
        hydXml = writeCell(hydXml, 'F9', 'RED DE HIDRANTES', strings);
        hydXml = writeCell(hydXml, 'F10', data.inspection.inspectionDate, strings);
        data.hydrants.forEach((item, index) => {
          const row = HYDRANT_RANGE.firstRow + index;
          for (const [column, value] of [
            [HYDRANT_COLUMNS.numero, item.numero], [HYDRANT_COLUMNS.ubicacion, item.locationNameSnapshot],
            [HYDRANT_COLUMNS.gabinete, inspectionCheckValue(item.gabinete)],
            [HYDRANT_COLUMNS.senalamiento, inspectionCheckValue(item.senalamiento)],
            [HYDRANT_COLUMNS.calcomania, inspectionCheckValue(item.calcomania)],
            [HYDRANT_COLUMNS.valvula_angular, inspectionCheckValue(item.valvula_angular)],
            [HYDRANT_COLUMNS.manguera, inspectionCheckValue(item.manguera)],
            [HYDRANT_COLUMNS.chiflon, inspectionCheckValue(item.chiflon)],
            [HYDRANT_COLUMNS.llave_acople, inspectionCheckValue(item.llave_acople)],
            [HYDRANT_COLUMNS.observaciones, hydrantComments(item)],
          ] as Array<[string, string]>) hydXml = writeCell(hydXml, `${column}${row}`, value, strings);
        });
      }

      cleanedSheets.set(extPath, extXml);
      cleanedSheets.set(hydPath, hydXml);
      for (const [sheetPath, sheetXml] of cleanedSheets) zip.file(sheetPath, sheetXml);
      let sharedStringReferences = 0;
      for (const entryName of Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
        const xml = cleanedSheets.get(entryName) ?? await zip.file(entryName)!.async('string');
        sharedStringReferences += (xml.match(/\bt="s"/g) ?? []).length;
      }
      zip.file('xl/sharedStrings.xml', strings.finalize(sharedStringReferences));
      const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      fs.writeFileSync(temporaryPath, bytes);
      fs.copyFileSync(temporaryPath, targetPath);
      fs.rmSync(temporaryPath, { force: true });

      const report = this.database.saveGeneratedReport({
        inspectionId, formatType: FORMAT_TYPE, filename, filePath: targetPath, generatedAt,
        status: 'generated', errorMessage: null, templateVersion: TEMPLATE_VERSION,
      });
      return report;
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      if (previous?.file_path !== targetPath && isInsideDirectory(targetPath, this.reportsDirectory)) {
        fs.rmSync(targetPath, { force: true });
      }
      const message = error instanceof Error ? error.message.slice(0, 2000) : 'Unknown report generation error';
      if (options.recordFailure !== false) {
        this.database.saveReportAttemptFailure(inspectionId, FORMAT_TYPE, message, generatedAt);
      }
      throw error;
    }
  }

  recordFailedAttempt(inspectionId: string, error: unknown) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : 'Unknown report generation error';
    this.database.saveReportAttemptFailure(inspectionId, FORMAT_TYPE, message, new Date().toISOString());
  }

  resolveDownload(reportId: string): { report: GeneratedReport; filePath: string } | undefined {
    const report = this.database.getReport(reportId);
    if (!report || report.status !== 'generated' || !report.file_path) return undefined;
    const filePath = path.resolve(report.file_path);
    if (!isInsideDirectory(filePath, this.reportsDirectory) || !fs.existsSync(filePath)) return undefined;
    return { report, filePath };
  }

  private availableFilename(data: InspectionReportData, previous: GeneratedReport | undefined): string {
    const company = sanitizeFilenamePart(data.inspection.companyName, 'Empresa').replace(/\s/g, '_');
    const date = sanitizeFilenamePart(data.inspection.inspectionDate, 'Fecha').replace(/\s/g, '_');
    const prefix = data.extinguishers.length && data.hydrants.length
      ? 'Reporte_Inspeccion'
      : data.hydrants.length ? 'Reporte_Hidrantes' : 'Reporte_Extintores';
    const base = `${prefix}_${company}_${date}_${shortInspectionId(data.inspection.id)}`;
    let candidate = `${base}.xlsx`;
    let suffix = 2;
    while (true) {
      const owner = this.database.getReportByFilename(candidate);
      if (!owner) return candidate;
      candidate = `${base}_${suffix++}.xlsx`;
    }
  }
}
