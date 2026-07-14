import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { GeneratedReport, LocalDatabase } from './database.js';
import { ExtinguisherInspectionPayload } from './validation.js';

const FORMAT_TYPE = 'extinguishers';
const TEMPLATE_VERSION = 'extintores-cancun-v1';
const MAX_EXTINGUISHERS = 115;
const FIRST_DATA_ROW = 14;
const LAST_DATA_ROW = 128;
const FIRST_DATA_COLUMN = 1;
const LAST_DATA_COLUMN = 35; // AI

const VALUE_COLUMNS = {
  numero: 'A',
  ubicacion: 'C',
  tipo_extintor: 'L',
  capacidad: 'O',
  proxima_recarga: 'Q',
  presion: 'R',
  altura: 'U',
  seguro: 'W',
  pintura: 'Y',
  manguera: 'AA',
  difusor: 'AC',
  senalamiento: 'AE',
  observaciones: 'AG',
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

function commentsFor(extinguisher: ExtinguisherInspectionPayload['extinguishers'][number]): string {
  const entries: Array<[string, string]> = [
    ['Presión', extinguisher.presion_comentario],
    ['Altura', extinguisher.altura_comentario],
    ['Seguro', extinguisher.seguro_comentario],
    ['Pintura', extinguisher.pintura_comentario],
    ['Manguera', extinguisher.manguera_comentario],
    ['Difusor', extinguisher.difusor_comentario],
    ['Señalamiento', extinguisher.senalamiento_comentario],
  ];
  const paragraphs: string[] = [];
  const general = extinguisher.observaciones.trim();
  if (general) paragraphs.push(general);
  for (const [label, comment] of entries) {
    const trimmed = comment.trim();
    if (trimmed) paragraphs.push(`${label}: ${trimmed}`);
  }
  return paragraphs.join('\n');
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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
  const attributes = openingTag
    .slice(2, openingTag.length - 1)
    .replace(/\/\s*$/, '')
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
      const text = [...entry[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((match) => xmlUnescape(match[1]))
        .join('');
      if (!this.added.has(text)) this.added.set(text, index);
    });
    this.nextIndex = entries.length;
    this.xml = this.xml.replace(/\s+(?:count|uniqueCount)="\d+"/g, '');
  }

  add(value: string): number {
    const existing = this.added.get(value);
    if (existing !== undefined) return existing;
    const index = this.nextIndex;
    this.nextIndex += 1;
    this.added.set(value, index);
    this.xml = this.xml.replace(
      '</sst>',
      `<si><t xml:space="preserve">${xmlEscape(value)}</t></si></sst>`
    );
    return index;
  }

  finalize(referenceCount: number): string {
    return this.xml.replace(
      /<sst\b/,
      `<sst count="${referenceCount}" uniqueCount="${this.nextIndex}"`
    );
  }
}

function clearInspectionCells(sheetXml: string): string {
  return sheetXml.replace(
    /<c\b(?=[^>]*\br=(?:"[A-Z]+\d+"|'[A-Z]+\d+'))[^>]*?\/>|<c\b(?=[^>]*\br=(?:"[A-Z]+\d+"|'[A-Z]+\d+'))[^>]*>[\s\S]*?<\/c>/g,
    (cellXml) => {
      const address = /\br=(?:"([A-Z]+\d+)"|'([A-Z]+\d+)')/.exec(cellXml)?.slice(1).find(Boolean);
      if (!address) return cellXml;
      const row = rowNumber(address);
      const column = columnNumber(address);
      const isTableCell = row >= FIRST_DATA_ROW && row <= LAST_DATA_ROW
        && column >= FIRST_DATA_COLUMN && column <= LAST_DATA_COLUMN;
      if (isTableCell || address === 'F9' || address === 'F10' || address === 'F11') {
        return cellWithValue(cellXml, null);
      }
      return cellXml;
    }
  );
}

function writeCell(
  sheetXml: string,
  address: string,
  value: string,
  sharedStrings: SharedStringWriter
): string {
  const expression = new RegExp(
    `<c\\b(?=[^>]*\\br=(?:"${address}"|'${address}'))[^>]*?\\/>|` +
    `<c\\b(?=[^>]*\\br=(?:"${address}"|'${address}'))[^>]*>[\\s\\S]*?<\\/c>`
  );
  if (!expression.test(sheetXml)) {
    throw new Error(`Template cell ${address} was not found`);
  }
  const index = sharedStrings.add(value);
  return sheetXml.replace(expression, (cellXml) => cellWithValue(cellXml, index));
}

async function extinguisherWorksheetPath(zip: JSZip): Promise<string> {
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relationshipsXml) throw new Error('Invalid XLSX workbook structure');
  const sheetTag = workbookXml.match(/<sheet\b(?=[^>]*\bname="EXTINTORES")[^>]*>/)?.[0];
  const relationshipId = sheetTag?.match(/\br:id="([^"]+)"/)?.[1];
  if (!relationshipId) throw new Error('Worksheet EXTINTORES was not found in the template');
  const escapedId = relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relationshipTag = relationshipsXml.match(
    new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapedId}")[^>]*/>`)
  )?.[0];
  const target = relationshipTag?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error('Worksheet EXTINTORES relationship is invalid');
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

  async generate(payload: ExtinguisherInspectionPayload): Promise<GeneratedReport> {
    const generatedAt = new Date().toISOString();
    const previous = this.database.getReportForInspection(payload.inspectionId, FORMAT_TYPE);
    let filename = this.availableFilename(payload, previous);
    const targetPath = path.join(this.reportsDirectory, filename);
    const temporaryPath = path.join(this.reportsDirectory, `.${randomUUID()}.tmp`);

    try {
      if (!fs.existsSync(this.templatePath)) {
        throw new Error(`Extinguisher template not found: ${this.templatePath}`);
      }
      if (payload.extinguishers.length > MAX_EXTINGUISHERS) {
        throw new Error(`A report cannot contain more than ${MAX_EXTINGUISHERS} extinguishers`);
      }

      const zip = await JSZip.loadAsync(await fs.promises.readFile(this.templatePath));
      const worksheetPath = await extinguisherWorksheetPath(zip);
      const worksheetFile = zip.file(worksheetPath);
      const sharedStringsFile = zip.file('xl/sharedStrings.xml');
      if (!worksheetFile) throw new Error('Worksheet EXTINTORES XML was not found in the template');
      if (!sharedStringsFile) throw new Error('Template shared strings were not found');
      let worksheetXml = clearInspectionCells(await worksheetFile.async('string'));
      const sharedStrings = new SharedStringWriter(await sharedStringsFile.async('string'));

      worksheetXml = writeCell(worksheetXml, 'F9', payload.company.name, sharedStrings);
      worksheetXml = writeCell(worksheetXml, 'F10', 'EXTINTORES', sharedStrings);
      worksheetXml = writeCell(worksheetXml, 'F11', payload.date, sharedStrings);

      payload.extinguishers.forEach((extinguisher, index) => {
        const row = FIRST_DATA_ROW + index;
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.numero}${row}`, extinguisher.numero, sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.ubicacion}${row}`, extinguisher.ubicacion, sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.tipo_extintor}${row}`, extinguisher.tipo_extintor, sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.capacidad}${row}`, extinguisher.capacidad, sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.proxima_recarga}${row}`, extinguisher.proxima_recarga, sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.presion}${row}`, inspectionCheckValue(extinguisher.presion), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.altura}${row}`, inspectionCheckValue(extinguisher.altura), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.seguro}${row}`, inspectionCheckValue(extinguisher.seguro), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.pintura}${row}`, inspectionCheckValue(extinguisher.pintura), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.manguera}${row}`, inspectionCheckValue(extinguisher.manguera), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.difusor}${row}`, inspectionCheckValue(extinguisher.difusor), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.senalamiento}${row}`, inspectionCheckValue(extinguisher.senalamiento), sharedStrings);
        worksheetXml = writeCell(worksheetXml, `${VALUE_COLUMNS.observaciones}${row}`, commentsFor(extinguisher), sharedStrings);
      });

      zip.file(worksheetPath, worksheetXml);
      let sharedStringReferences = 0;
      for (const entryName of Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
        const xml = entryName === worksheetPath
          ? worksheetXml
          : await zip.file(entryName)!.async('string');
        sharedStringReferences += (xml.match(/\bt="s"/g) ?? []).length;
      }
      zip.file('xl/sharedStrings.xml', sharedStrings.finalize(sharedStringReferences));
      const reportBytes = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      fs.writeFileSync(temporaryPath, reportBytes);
      fs.copyFileSync(temporaryPath, targetPath);
      fs.rmSync(temporaryPath, { force: true });

      const report = this.database.saveGeneratedReport({
        inspectionId: payload.inspectionId,
        formatType: FORMAT_TYPE,
        filename,
        filePath: targetPath,
        generatedAt,
        status: 'generated',
        errorMessage: null,
        templateVersion: TEMPLATE_VERSION,
      });
      if (previous?.file_path && previous.file_path !== targetPath && isInsideDirectory(previous.file_path, this.reportsDirectory)) {
        fs.rmSync(previous.file_path, { force: true });
      }
      return report;
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      const message = error instanceof Error ? error.message.slice(0, 2000) : 'Unknown report generation error';
      this.database.saveGeneratedReport({
        inspectionId: payload.inspectionId,
        formatType: FORMAT_TYPE,
        filename: previous?.filename ?? filename,
        filePath: previous?.file_path ?? '',
        generatedAt,
        status: 'error',
        errorMessage: message,
        templateVersion: TEMPLATE_VERSION,
      });
      throw error;
    }
  }

  resolveDownload(reportId: string): { report: GeneratedReport; filePath: string } | undefined {
    const report = this.database.getReport(reportId);
    if (!report || report.status !== 'generated' || !report.file_path) return undefined;
    const filePath = path.resolve(report.file_path);
    if (!isInsideDirectory(filePath, this.reportsDirectory) || !fs.existsSync(filePath)) return undefined;
    return { report, filePath };
  }

  private availableFilename(
    payload: ExtinguisherInspectionPayload,
    previous: GeneratedReport | undefined
  ): string {
    const company = sanitizeFilenamePart(payload.company.name, 'Empresa').replace(/\s/g, '_');
    const date = sanitizeFilenamePart(payload.date, 'Fecha').replace(/\s/g, '_');
    const shortId = shortInspectionId(payload.inspectionId);
    const base = `Reporte_Extintores_${company}_${date}_${shortId}`;
    let candidate = `${base}.xlsx`;
    let suffix = 2;
    while (true) {
      const owner = this.database.getReportByFilename(candidate);
      if (!owner || owner.id === previous?.id) return candidate;
      candidate = `${base}_${suffix}.xlsx`;
      suffix += 1;
    }
  }
}
