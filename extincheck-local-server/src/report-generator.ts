import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { GeneratedReport, InspectionReportData, LocalDatabase } from './database.js';
import { FIRE_PUMP_CONFIG, FIRE_PUMP_FORM_TYPES } from './fire-pump-config.js';

const FORMAT_TYPE = 'inspection';
const TEMPLATE_VERSION = 'cancun-fire-pumps-v5';

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

function writeNumberCell(sheetXml: string, address: string, value: number): string {
  const expression = new RegExp(
    `<c\\b(?=[^>]*\\br=(?:"${address}"|'${address}'))[^>]*?\\/>|` +
    `<c\\b(?=[^>]*\\br=(?:"${address}"|'${address}'))[^>]*>[\\s\\S]*?<\\/c>`
  );
  if (!expression.test(sheetXml)) throw new Error(`Template cell ${address} was not found`);
  return sheetXml.replace(expression, (cellXml) => {
    const openingTag = /^<c\b[^>]*\/?\s*>/.exec(cellXml)?.[0];
    if (!openingTag) throw new Error(`Template cell ${address} is invalid`);
    const attributes = openingTag.slice(2, openingTag.length - 1).replace(/\/\s*$/, '')
      .replace(/\s+t=(?:"[^"]*"|'[^']*')/g, '');
    return `<c${attributes}><v>${value}</v></c>`;
  });
}

function numericPumpReading(questionId: string, value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const numericId = questionId === 'potencia'
    || /(?:presion|segundos|_v_|_amp_|2_3_banco)/.test(questionId);
  if (!numericId || !/^-?(?:\d+|\d*\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function writePumpValue(
  sheetXml: string,
  address: string,
  questionId: string,
  value: string | number,
  strings: SharedStringWriter
): string {
  const numeric = numericPumpReading(questionId, value);
  return numeric === null
    ? writeCell(sheetXml, address, String(value), strings)
    : writeNumberCell(sheetXml, address, numeric);
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

function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Stored technician signature is not a valid PNG');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function inlineCell(address: string, value: string, style: number): string {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function formatNames(ids: string[]): string {
  const labels: Record<string, string> = { extintores: 'EXTINTORES', hidrantes: 'HIDRANTES' };
  const names = ids
    .filter((id) => !['jockey', 'electrica', 'diesel'].includes(id))
    .map((id) => labels[id] ?? id);
  if (ids.some((id) => ['jockey', 'electrica', 'diesel'].includes(id))) names.push('BOMBAS');
  return names.join(', ');
}

async function addSignaturesWorksheet(zip: JSZip, data: InspectionReportData): Promise<void> {
  const workbookFile = zip.file('xl/workbook.xml');
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!workbookFile || !relationshipsFile || !contentTypesFile) throw new Error('Invalid workbook package');
  let workbookXml = await workbookFile.async('string');
  let relationshipsXml = await relationshipsFile.async('string');
  let contentTypesXml = await contentTypesFile.async('string');

  const sheetNumber = Math.max(0, ...Object.keys(zip.files).map((name) =>
    Number(/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(name)?.[1] ?? 0))) + 1;
  const drawingNumber = Math.max(0, ...Object.keys(zip.files).map((name) =>
    Number(/^xl\/drawings\/drawing(\d+)\.xml$/.exec(name)?.[1] ?? 0))) + 1;
  const relationshipId = Math.max(0, ...[...relationshipsXml.matchAll(/\bId="rId(\d+)"/g)]
    .map((match) => Number(match[1]))) + 1;
  const sheetId = Math.max(0, ...[...workbookXml.matchAll(/\bsheetId="(\d+)"/g)]
    .map((match) => Number(match[1]))) + 1;

  const signature = data.signature;
  const signedAt = signature ? new Date(signature.signed_at).toLocaleString('es-MX') : 'Sin firma registrada';
  const signerName = signature?.signer_name ?? data.inspection.technicianName;
  const rows = [
    `<row r="3" ht="28" customHeight="1">${inlineCell('A3', 'FUEGO & SEGURIDAD', 77)}</row>`,
    `<row r="5" ht="24" customHeight="1">${inlineCell('A5', 'FIRMA DE INSPECCIÓN', 77)}</row>`,
    `<row r="8">${inlineCell('A8', 'CLIENTE:', 71)}${inlineCell('I8', data.inspection.companyName, 73)}</row>`,
    `<row r="9">${inlineCell('A9', 'INSPECCIÓN:', 71)}${inlineCell('I9', data.inspection.id, 73)}</row>`,
    `<row r="10">${inlineCell('A10', 'FORMATOS:', 71)}${inlineCell('I10', formatNames(data.inspection.selectedFormatIds), 73)}</row>`,
    `<row r="11">${inlineCell('A11', 'FECHA:', 71)}${inlineCell('I11', data.inspection.inspectionDate, 73)}</row>`,
    `<row r="13" ht="22" customHeight="1">${inlineCell('A13', 'FIRMA DEL TÉCNICO', 77)}</row>`,
    `<row r="30">${inlineCell('A30', 'TÉCNICO:', 71)}${inlineCell('I30', signerName, 73)}</row>`,
    `<row r="31">${inlineCell('A31', 'FIRMADO:', 71)}${inlineCell('I31', signedAt, 73)}</row>`,
  ].join('');
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:AI34"/>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="35" width="3" customWidth="1"/></cols>` +
    `<sheetData>${rows}</sheetData>` +
    `<mergeCells count="12"><mergeCell ref="A3:AI3"/><mergeCell ref="A5:AI5"/>` +
    `<mergeCell ref="A8:H8"/><mergeCell ref="I8:AI8"/><mergeCell ref="A9:H9"/><mergeCell ref="I9:AI9"/>` +
    `<mergeCell ref="A10:H10"/><mergeCell ref="I10:AI10"/><mergeCell ref="A11:H11"/><mergeCell ref="I11:AI11"/>` +
    `<mergeCell ref="A13:AI13"/><mergeCell ref="A30:H30"/><mergeCell ref="I30:AI30"/><mergeCell ref="A31:H31"/><mergeCell ref="I31:AI31"/></mergeCells>` +
    `<pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0" footer="0"/>` +
    `<pageSetup orientation="landscape" paperSize="1" fitToWidth="1" fitToHeight="1"/>` +
    `<drawing r:id="rId1"/></worksheet>`;
  // The count attribute is advisory; using the actual number avoids Excel repair warnings.
  const normalizedSheetXml = sheetXml.replace('mergeCells count="12"', 'mergeCells count="15"');
  zip.file(`xl/worksheets/sheet${sheetNumber}.xml`, normalizedSheetXml);
  zip.file(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNumber}.xml"/></Relationships>`);

  let pictureXml = '';
  let drawingRelationships = '';
  if (signature) {
    if (!fs.existsSync(signature.file_path)) throw new Error('Stored technician signature file was not found');
    const bytes = fs.readFileSync(signature.file_path);
    const dimensions = pngSize(bytes);
    const maxWidth = 4_500_000;
    const maxHeight = 1_500_000;
    const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
    const width = Math.round(dimensions.width * scale);
    const height = Math.round(dimensions.height * scale);
    const colOffset = Math.round((maxWidth - width) / 2);
    const rowOffset = Math.round((maxHeight - height) / 2);
    const imageName = `signature${sheetNumber}.png`;
    zip.file(`xl/media/${imageName}`, bytes);
    pictureXml = `<xdr:oneCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>${colOffset}</xdr:colOff><xdr:row>14</xdr:row><xdr:rowOff>${rowOffset}</xdr:rowOff></xdr:from>` +
      `<xdr:ext cx="${width}" cy="${height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Firma del técnico"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    drawingRelationships = `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imageName}"/>`;
  }
  const borderShape = `<xdr:twoCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>14</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>28</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>28</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="1" name="Área de firma"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    `<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;
  zip.file(`xl/drawings/drawing${drawingNumber}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pictureXml}${borderShape}</xdr:wsDr>`);
  if (drawingRelationships) {
    zip.file(`xl/drawings/_rels/drawing${drawingNumber}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRelationships}</Relationships>`);
  }

  workbookXml = workbookXml.replace('</sheets>', `<sheet name="FIRMAS" sheetId="${sheetId}" r:id="rId${relationshipId}"/></sheets>`);
  relationshipsXml = relationshipsXml.replace('</Relationships>',
    `<Relationship Id="rId${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNumber}.xml"/></Relationships>`);
  contentTypesXml = contentTypesXml.replace('</Types>',
    `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/drawings/drawing${drawingNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', relationshipsXml);
  zip.file('[Content_Types].xml', contentTypesXml);

  const appFile = zip.file('docProps/app.xml');
  if (appFile) {
    let appXml = await appFile.async('string');
    appXml = appXml.replace(/(<vt:lpstr>Hojas de cálculo<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)10(<\/vt:i4>)/,
      (_match, before: string, after: string) => `${before}11${after}`);
    appXml = appXml.replace(/(<TitlesOfParts><vt:vector size=")16(" baseType="lpstr">)/,
      (_match, before: string, after: string) => `${before}17${after}`);
    appXml = appXml.replace('<vt:lpstr>Ansul R-102</vt:lpstr>',
      '<vt:lpstr>Ansul R-102</vt:lpstr><vt:lpstr>FIRMAS</vt:lpstr>');
    zip.file('docProps/app.xml', appXml);
  }
}

async function addEvidenceWorksheet(zip: JSZip, data: InspectionReportData): Promise<void> {
  const workbookFile = zip.file('xl/workbook.xml');
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!workbookFile || !relationshipsFile || !contentTypesFile) throw new Error('Invalid workbook package');
  let workbookXml = await workbookFile.async('string');
  let relationshipsXml = await relationshipsFile.async('string');
  let contentTypesXml = await contentTypesFile.async('string');
  const sheetNumber = Math.max(0, ...Object.keys(zip.files).map((name) =>
    Number(/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(name)?.[1] ?? 0))) + 1;
  const drawingNumber = Math.max(0, ...Object.keys(zip.files).map((name) =>
    Number(/^xl\/drawings\/drawing(\d+)\.xml$/.exec(name)?.[1] ?? 0))) + 1;
  const relationshipId = Math.max(0, ...[...relationshipsXml.matchAll(/\bId="rId(\d+)"/g)]
    .map((match) => Number(match[1]))) + 1;
  const sheetId = Math.max(0, ...[...workbookXml.matchAll(/\bsheetId="(\d+)"/g)]
    .map((match) => Number(match[1]))) + 1;

  const rowCells = new Map<number, string[]>();
  const addCells = (row: number, ...cells: string[]) => rowCells.set(row, [...(rowCells.get(row) ?? []), ...cells]);
  addCells(2, inlineCell('A2', 'EVIDENCIAS FOTOGRÁFICAS', 77));
  addCells(4, inlineCell('A4', 'CLIENTE:', 71), inlineCell('I4', data.inspection.companyName, 73));
  addCells(5, inlineCell('A5', 'INSPECCIÓN:', 71), inlineCell('I5', data.inspection.id, 73));
  addCells(6, inlineCell('A6', 'FECHA:', 71), inlineCell('I6', data.inspection.inspectionDate, 73));
  const merges = ['A2:AI2', 'A4:H4', 'I4:AI4', 'A5:H5', 'I5:AI5', 'A6:H6', 'I6:AI6'];
  const drawings: string[] = [];
  const drawingRelationships: string[] = [];
  const rowBreaks: number[] = [];
  if (!data.evidence.length) {
    addCells(10, inlineCell('A10', 'Sin evidencias fotográficas registradas.', 73));
    merges.push('A10:AI10');
  }
  data.evidence.forEach((evidence, index) => {
    if (!fs.existsSync(evidence.file_path)) throw new Error(`Evidence file was not found: ${evidence.id}`);
    const pair = Math.floor(index / 2);
    const left = index % 2 === 0;
    const startRow = 9 + pair * 19;
    const firstColumn = left ? 1 : 19;
    const labelCell = `${left ? 'A' : 'S'}${startRow}`;
    const valueCell = `${left ? 'E' : 'W'}${startRow}`;
    const format = evidence.format_type === 'extintores' ? 'EXTINTORES'
      : evidence.format_type === 'hidrantes' ? 'HIDRANTES'
        : evidence.format_type === 'fire_pumps'
          ? `BOMBAS · ${evidence.form_type?.replace('pump_', '').toUpperCase() ?? 'GENERAL'}`
          : evidence.format_type.toUpperCase();
    const equipment = evidence.item_id
      ? (evidence.format_type === 'extintores' ? data.extinguishers.find((item) => item.id === evidence.item_id)?.numero
        : evidence.format_type === 'hidrantes' ? data.hydrants.find((item) => item.id === evidence.item_id)?.numero : null)
        ?? evidence.item_id : 'General';
    const description = evidence.caption || 'Sin descripción';
    addCells(startRow, inlineCell(labelCell, format, 77), inlineCell(valueCell, `Equipo: ${equipment}`, 73));
    addCells(startRow + 1, inlineCell(labelCell.replace(/\d+$/, String(startRow + 1)), `Ubicación: ${evidence.location_name_snapshot || 'Sin ubicación'}`, 73));
    addCells(startRow + 2, inlineCell(labelCell.replace(/\d+$/, String(startRow + 2)), description, 73));
    merges.push(`${left ? 'A' : 'S'}${startRow}:${left ? 'D' : 'V'}${startRow}`);
    merges.push(`${left ? 'E' : 'W'}${startRow}:${left ? 'Q' : 'AI'}${startRow}`);
    merges.push(`${left ? 'A' : 'S'}${startRow + 1}:${left ? 'Q' : 'AI'}${startRow + 1}`);
    merges.push(`${left ? 'A' : 'S'}${startRow + 2}:${left ? 'Q' : 'AI'}${startRow + 2}`);
    const extension = evidence.mime_type === 'image/png' ? 'png' : 'jpg';
    const imageName = `evidence${sheetNumber}-${index + 1}.${extension}`;
    zip.file(`xl/media/${imageName}`, fs.readFileSync(evidence.file_path));
    const maxWidth = 3_400_000;
    const maxHeight = 1_500_000;
    const scale = Math.min(maxWidth / evidence.width, maxHeight / evidence.height);
    const width = Math.round(evidence.width * scale);
    const height = Math.round(evidence.height * scale);
    const relId = `rId${index + 1}`;
    drawings.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${firstColumn}</xdr:col><xdr:colOff>${Math.round((maxWidth - width) / 2)}</xdr:colOff><xdr:row>${startRow + 2}</xdr:row><xdr:rowOff>${Math.round((maxHeight - height) / 2)}</xdr:rowOff></xdr:from><xdr:ext cx="${width}" cy="${height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index * 2 + 1}" name="Evidencia ${xmlEscape(evidence.id)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
    drawings.push(`<xdr:twoCellAnchor><xdr:from><xdr:col>${firstColumn}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${startRow + 2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${firstColumn + 15}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${startRow + 16}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${index * 2 + 2}" name="Marco evidencia"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`);
    drawingRelationships.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imageName}"/>`);
    if (left && pair > 0) rowBreaks.push(startRow - 1);
  });
  const lastRow = Math.max(12, 9 + Math.ceil(data.evidence.length / 2) * 19);
  const breaksXml = rowBreaks.length ? `<rowBreaks count="${rowBreaks.length}" manualBreakCount="${rowBreaks.length}">${rowBreaks.map((row) => `<brk id="${row}" max="16383" man="1"/>`).join('')}</rowBreaks>` : '';
  const rowsXml = [...rowCells.entries()].sort(([left], [right]) => left - right)
    .map(([row, cells]) => `<row r="${row}"${row === 2 || (!data.evidence.length && row === 10) ? ' ht="28" customHeight="1"' : ''}>${cells.join('')}</row>`).join('');
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:AI${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="35" width="3" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData><mergeCells count="${merges.length}">${merges.map((range) => `<mergeCell ref="${range}"/>`).join('')}</mergeCells><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0" footer="0"/><pageSetup orientation="landscape" paperSize="1" fitToWidth="1" fitToHeight="0"/>${breaksXml}<drawing r:id="rId1"/></worksheet>`;
  zip.file(`xl/worksheets/sheet${sheetNumber}.xml`, sheetXml);
  zip.file(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNumber}.xml"/></Relationships>`);
  zip.file(`xl/drawings/drawing${drawingNumber}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawings.join('')}</xdr:wsDr>`);
  if (drawingRelationships.length) zip.file(`xl/drawings/_rels/drawing${drawingNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRelationships.join('')}</Relationships>`);
  workbookXml = workbookXml.replace('</sheets>', `<sheet name="EVIDENCIAS" sheetId="${sheetId}" r:id="rId${relationshipId}"/></sheets>`);
  relationshipsXml = relationshipsXml.replace('</Relationships>', `<Relationship Id="rId${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNumber}.xml"/></Relationships>`);
  contentTypesXml = contentTypesXml.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing${drawingNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  if (!contentTypesXml.includes('Extension="jpg"')) contentTypesXml = contentTypesXml.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', relationshipsXml);
  zip.file('[Content_Types].xml', contentTypesXml);
  const appFile = zip.file('docProps/app.xml');
  if (appFile) {
    let appXml = await appFile.async('string');
    appXml = appXml.replace(/(<vt:lpstr>Hojas de cálculo<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)11(<\/vt:i4>)/,
      (_match, before: string, after: string) => `${before}12${after}`);
    appXml = appXml.replace(/(<TitlesOfParts><vt:vector size=")17(" baseType="lpstr">)/,
      (_match, before: string, after: string) => `${before}18${after}`);
    appXml = appXml.replace('<vt:lpstr>FIRMAS</vt:lpstr>',
      '<vt:lpstr>FIRMAS</vt:lpstr><vt:lpstr>EVIDENCIAS</vt:lpstr>');
    zip.file('docProps/app.xml', appXml);
  }
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
    const includesFirePumps = ['jockey', 'electrica', 'diesel']
      .every((id) => data.inspection.selectedFormatIds.includes(id));
    if (!includesExtinguishers && !includesHydrants && !includesFirePumps) {
      throw new Error('Inspection has no supported formats');
    }
    if (data.extinguishers.length > 115) throw new Error('A report cannot contain more than 115 extinguishers');
    if (data.hydrants.length > 38) throw new Error('A report cannot contain more than 38 hydrants');

    const previous = this.database.getReportForInspection(inspectionId, FORMAT_TYPE);
    const filename = this.availableFilename(data, previous);
    const targetPath = path.join(this.reportsDirectory, filename);
    const temporaryPath = path.join(this.reportsDirectory, `.${randomUUID()}.tmp`);
    const backupPath = previous?.file_path === targetPath && fs.existsSync(targetPath)
      ? path.join(this.reportsDirectory, `.${randomUUID()}.backup`)
      : null;

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

      if (includesFirePumps) {
        for (const formType of FIRE_PUMP_FORM_TYPES) {
          const config = FIRE_PUMP_CONFIG[formType];
          const form = data.firePumps.find((item) => item.formType === formType);
          if (!form) throw new Error(`Missing fire pump form: ${formType}`);
          const pumpPath = await worksheetPath(zip, config.sheetName);
          let pumpXml = cleanedSheets.get(pumpPath);
          if (!pumpXml) throw new Error(`Cleaned worksheet was not found: ${config.sheetName}`);
          pumpXml = writeCell(pumpXml, config.generalCells.cliente, data.inspection.companyName, strings);
          pumpXml = writeCell(pumpXml, config.generalCells.atencion, data.inspection.attention, strings);
          pumpXml = writeCell(pumpXml, config.generalCells.area, data.inspection.area, strings);
          pumpXml = writeCell(pumpXml, config.generalCells.fecha, data.inspection.inspectionDate, strings);

          const answers = new Map(form.answers.map((answer) => [answer.questionId, answer]));
          for (const [questionId, cells] of Object.entries(config.questions)) {
            const answer = answers.get(questionId);
            if (!answer?.answer) continue;
            const selectedCell = answer.answer === 'si'
              ? cells.yesCell
              : answer.answer === 'na'
                ? cells.naCell
                : cells.noCell;
            pumpXml = writeCell(pumpXml, selectedCell, 'X', strings);
            if (answer.comment) {
              pumpXml = writeCell(pumpXml, cells.commentCell, answer.comment, strings);
            }
            if (cells.parameterCell && answer.parameter !== null && answer.parameter !== undefined) {
              pumpXml = writePumpValue(
                pumpXml, cells.parameterCell, questionId, answer.parameter, strings
              );
            }
          }
          for (const [questionId, address] of Object.entries(config.readingCells)) {
            const reading = answers.get(questionId)?.reading;
            if (reading === null || reading === undefined || reading === '') continue;
            pumpXml = writePumpValue(pumpXml, address, questionId, reading, strings);
          }
          if (form.observations) {
            pumpXml = writeCell(
              pumpXml, config.observationsCell, form.observations, strings
            );
          }
          cleanedSheets.set(pumpPath, pumpXml);
        }
      }

      cleanedSheets.set(extPath, extXml);
      cleanedSheets.set(hydPath, hydXml);
      for (const [sheetPath, sheetXml] of cleanedSheets) zip.file(sheetPath, sheetXml);
      await addSignaturesWorksheet(zip, data);
      await addEvidenceWorksheet(zip, data);
      let sharedStringReferences = 0;
      for (const entryName of Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
        const xml = cleanedSheets.get(entryName) ?? await zip.file(entryName)!.async('string');
        sharedStringReferences += (xml.match(/\bt="s"/g) ?? []).length;
      }
      zip.file('xl/sharedStrings.xml', strings.finalize(sharedStringReferences));
      const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      fs.writeFileSync(temporaryPath, bytes);
      if (backupPath) fs.copyFileSync(targetPath, backupPath);
      fs.copyFileSync(temporaryPath, targetPath);
      fs.rmSync(temporaryPath, { force: true });

      const report = this.database.saveGeneratedReport({
        inspectionId, formatType: FORMAT_TYPE, filename, filePath: targetPath, generatedAt,
        status: 'generated', errorMessage: null, templateVersion: TEMPLATE_VERSION,
      });
      if (backupPath) fs.rmSync(backupPath, { force: true });
      return report;
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, targetPath);
        fs.rmSync(backupPath, { force: true });
      }
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
    const prefix = data.firePumps.length || (data.extinguishers.length && data.hydrants.length)
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
