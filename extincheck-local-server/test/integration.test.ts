import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { AdminRepository } from '../src/admin-repository.js';
import { createApp } from '../src/app.js';
import { createTestSecurityConfig } from '../src/config.js';
import { LocalDatabase } from '../src/database.js';
import { ExtinguisherReportService, SHEET_CLEANUP_CONFIG } from '../src/report-generator.js';
import { FIRE_PUMP_CONFIG, FIRE_PUMP_FORM_TYPES, PumpFormType } from '../src/fire-pump-config.js';
import {
  ALARM_DEVICE_CONFIG,
  ALARM_MOBILE_IDS,
  ALARM_PANEL_QUESTION_CELLS,
  AlarmDeviceFormType,
} from '../src/alarm-config.js';
import { ANSUL_QUESTION_CELLS } from '../src/ansul-config.js';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const templatePath = path.join(serverRoot, 'templates', 'FORMATOS P.R. CANCUN.xlsx');
const signaturePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function technicianSignature(signerName = 'Daniel Cocom', signedAt = '2026-07-22T18:00:00.000Z') {
  return { mimeType: 'image/png' as const, dataBase64: signaturePngBase64, signedAt, signerName };
}

function evidenceMetadata(evidenceId = '11111111-1111-4111-8111-111111111111', itemId = 'ext-1') {
  return { evidenceId, formatType: 'extintores', itemId, fieldKey: 'evidence',
    caption: 'Manómetro fuera de rango', locationNameSnapshot: 'Recepción',
    capturedAt: '2026-07-22T18:00:00.000Z', updatedAt: '2026-07-22T18:00:00.000Z' };
}

async function uploadEvidence(baseUrl: string, inspectionId: string, metadata = evidenceMetadata(),
  bytes = Buffer.from(signaturePngBase64, 'base64'), mimeType = 'image/png') {
  const form = new FormData();
  form.append('inspectionId', inspectionId);
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', new Blob([bytes], { type: mimeType }), 'evidence.png');
  form.append('thumbnail', new Blob([bytes], { type: mimeType }), 'thumbnail.png');
  return fetch(`${baseUrl}/api/inspections/${inspectionId}/evidence`, { method: 'POST', body: form });
}

function fileHash(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function extinguisher(id: string, numero: string) {
  return {
    id,
    numero,
    ubicacion: `Ubicación ${numero}`,
    tipo_extintor: 'PQS',
    capacidad: '6 KG',
    proxima_recarga: '2027-01',
    presion: 'si' as const,
    presion_comentario: numero === '1' ? 'manómetro fuera de rango' : '',
    altura: 'si' as const,
    altura_comentario: '',
    seguro: 'si' as const,
    seguro_comentario: '',
    pintura: 'no' as const,
    pintura_comentario: numero === '1' ? 'deteriorada' : '',
    manguera: 'si' as const,
    manguera_comentario: numero === '1' ? 'presenta grietas' : '',
    difusor: 'na' as const,
    difusor_comentario: '',
    senalamiento: 'si' as const,
    senalamiento_comentario: '',
    observaciones: numero === '1' ? 'Requiere mantenimiento.' : '',
    createdAt: 1,
    updatedAt: 2,
  };
}

function payload(inspectionId = 'inspection-pilot-001') {
  return {
    inspectionId,
    company: { id: null, name: 'Bodega Caribe' },
    date: '2026-07-13',
    technician: { id: null, name: 'Daniel Cocom' },
    extinguishers: [extinguisher('ext-1', '1'), extinguisher('ext-2', '2'), extinguisher('ext-3', '3')],
    syncVersion: 100,
  };
}

function hydrant(id: string, numero: string) {
  return {
    id,
    numero,
    locationId: numero === '3' ? null : `location-hydrant-${numero}`,
    locationNameSnapshot: `Ubicación hidrante ${numero}`,
    customLocation: numero === '3',
    gabinete: 'si' as const,
    gabinete_comentario: '',
    senalamiento: 'no' as const,
    senalamiento_comentario: numero === '1' ? 'Señal deteriorada' : '',
    calcomania: 'na' as const,
    calcomania_comentario: '',
    valvula_angular: 'si' as const,
    valvula_angular_comentario: '',
    manguera: 'si' as const,
    manguera_comentario: '',
    chiflon: 'si' as const,
    chiflon_comentario: '',
    llave_acople: 'si' as const,
    llave_acople_comentario: '',
    observaciones: numero === '1' ? 'Requiere señal nueva.' : '',
    createdAt: 3,
    updatedAt: 4,
  };
}

function hydrantPayload(inspectionId = 'inspection-hydrants-001', count = 3) {
  return {
    inspectionId,
    company: { id: 'company-1', name: 'Hotel Piloto' },
    branch: { id: 'branch-1', name: 'Torre principal' },
    date: '2026-07-21',
    technician: { id: null, name: 'Daniel Cocom' },
    hydrants: Array.from({ length: count }, (_, index) => hydrant(`hyd-${index + 1}`, String(index + 1))),
    syncVersion: 200,
  };
}

function completeFirePumpForm(formType: PumpFormType) {
  const config = FIRE_PUMP_CONFIG[formType];
  const answers = Object.keys(config.questions).map((questionId, index) => ({
    questionId,
    answer: (index % 3 === 0 ? 'si' : index % 3 === 1 ? 'na' : 'no') as 'si' | 'na' | 'no',
    parameter: config.questions[questionId].fixedParameter,
    comment: index === 0 ? `Comentario ${config.mobileId}` : '',
  }));
  for (const questionId of Object.keys(config.readingCells)) {
    answers.push({
      questionId,
      answer: undefined as never,
      parameter: undefined,
      comment: '',
      reading: questionId === 'capacidad'
        ? '500 GPM'
        : questionId === 'voltaje'
          ? '220 V'
          : questionId.includes('banco') ? '13.5' : '145',
    } as typeof answers[number] & { reading: string });
  }
  return {
    formType,
    status: 'complete' as const,
    observations: `Observaciones ${config.mobileId}`,
    updatedAt: 1_785_000_000_000,
    answers,
  };
}

function firePumpsPayload(inspectionId = 'inspection-fire-pumps-001') {
  return {
    inspectionId,
    company: { id: 'company-pumps', name: 'Hotel Bombas' },
    branch: { id: 'branch-pumps', name: 'Cuarto principal' },
    attention: 'Mantenimiento',
    area: 'Cuarto de bombas',
    date: '2026-07-23',
    technician: { id: null, name: 'Daniel Cocom' },
    syncVersion: 300,
    selectedFormatIds: ['jockey', 'electrica', 'diesel'],
    firePumps: FIRE_PUMP_FORM_TYPES.map(completeFirePumpForm),
    signature: technicianSignature(),
  };
}

function alarmDevice(formType: AlarmDeviceFormType, suffix: number) {
  return {
    id: `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
    identifier: `D-${suffix}`,
    loop: `L-${suffix}`,
    deviceType: formType === 'notification_devices' ? 'Sirena' : 'Detector de humo',
    locationId: null,
    locationNameSnapshot: `Nivel ${suffix} · Pasillo`,
    customLocation: true,
    alarm: 'si' as const,
    supervision: 'no' as const,
    cleaning: 'na' as const,
    observations: `Observación dispositivo ${suffix}`,
    createdAt: 1_785_000_000_000 + suffix,
    updatedAt: 1_785_000_001_000 + suffix,
  };
}

function alarmPayload(inspectionId = 'inspection-alarms-001') {
  const answers = Object.keys(ALARM_PANEL_QUESTION_CELLS).map((questionId, index) => ({
    questionId,
    answer: (index % 3 === 0 ? 'si' : index % 3 === 1 ? 'na' : 'no') as 'si' | 'na' | 'no',
    parameter: index === 0 ? 'Parámetro piloto' : '',
    reading: index === 0 ? 'Lectura piloto' : '',
    comment: index === 0 ? 'Comentario piloto' : '',
  }));
  return {
    inspectionId,
    company: { id: 'company-alarms', name: 'Hotel Alarmas' },
    branch: { id: 'branch-alarms', name: 'Torre A' },
    attention: 'Mantenimiento',
    area: 'Áreas comunes',
    date: '2026-07-23',
    technician: { id: null, name: 'Daniel Cocom' },
    syncVersion: 400,
    selectedFormatIds: [...ALARM_MOBILE_IDS],
    alarms: {
      systemName: 'Notifier NFS2-3030',
      systemNameDiscrepancies: [
        { source: 'legacy.panel.sistema', value: 'Notifier antiguo' },
      ],
      panel: {
        formType: 'alarm_panel' as const,
        status: 'complete' as const,
        observations: 'Tablero operando correctamente.',
        updatedAt: 1_785_000_000_000,
        answers,
      },
      addressedDevices: {
        formType: 'addressed_devices' as const,
        status: 'complete' as const,
        items: [alarmDevice('addressed_devices', 1)],
        observations: 'Dispositivos direccionados revisados.',
        updatedAt: 1_785_000_000_001,
      },
      conventionalDevices: {
        formType: 'conventional_devices' as const,
        status: 'complete' as const,
        items: [alarmDevice('conventional_devices', 2)],
        observations: 'Dispositivos convencionales revisados.',
        updatedAt: 1_785_000_000_002,
      },
      notificationDevices: {
        formType: 'notification_devices' as const,
        status: 'complete' as const,
        items: [alarmDevice('notification_devices', 3)],
        observations: 'Dispositivos de notificación revisados.',
        updatedAt: 1_785_000_000_003,
      },
    },
  };
}

function ansulPayload(inspectionId = 'inspection-ansul-001') {
  return {
    inspectionId,
    company: { id: 'company-ansul', name: 'Restaurante Piloto' },
    branch: { id: 'branch-ansul', name: 'Edificio principal' },
    attention: 'Mantenimiento',
    area: 'Cocina general',
    date: '2026-07-23',
    technician: { id: null, name: 'Daniel Cocom' },
    syncVersion: 500,
    selectedFormatIds: ['ansul_r102'],
    ansul: {
      formType: 'ansul_r102' as const,
      status: 'complete' as const,
      systemName: 'Sistema cocina principal',
      capacityGallons: '3',
      observations: 'Primera línea conservada.\nSegunda línea conservada.',
      normalizationIssues: [],
      updatedAt: 1_785_000_000_500,
      answers: Object.keys(ANSUL_QUESTION_CELLS).map((questionId, index) => ({
        questionId,
        answer: (index % 3 === 0 ? 'si' : index % 3 === 1 ? 'na' : 'no') as 'si' | 'na' | 'no',
        quantity: index === 0 ? 2 : undefined,
        model: index === 0 ? 'R-102-A' : undefined,
        comment: index === 0 ? 'Revisión piloto' : undefined,
      })),
    },
    signature: technicianSignature(),
  };
}

async function testServer(context: Parameters<typeof test>[1] extends (context: infer C) => unknown ? C : never) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-server-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = new LocalDatabase(databasePath);
  const adminRepository = new AdminRepository(databasePath);
  const reportService = new ExtinguisherReportService(database, templatePath, path.join(directory, 'reports'));
  const server = createApp(
    database,
    reportService,
    adminRepository,
    path.join(serverRoot, 'admin-web', 'dist'),
    createTestSecurityConfig({ bypassAuthenticationForTests: true })
  ).listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    adminRepository.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { database, databasePath, adminRepository, reportService, baseUrl: `http://127.0.0.1:${address.port}` };
}

function assertUnselectedVariableAreasAreEmpty(book: ExcelJS.Workbook, selectedSheets: string[]) {
  for (const [sheetName, cleanup] of Object.entries(SHEET_CLEANUP_CONFIG)) {
    if (selectedSheets.includes(sheetName)) continue;
    const sheet = book.getWorksheet(sheetName);
    if (!sheet) continue;
    for (const address of cleanup.cells) assert.equal(sheet.getCell(address).value, null, `${sheetName}!${address}`);
    for (const range of cleanup.ranges) {
      for (let row = range.firstRow; row <= range.lastRow; row += 1) {
        for (let column = range.firstColumn; column <= range.lastColumn; column += 1) {
          assert.equal(sheet.getCell(row, column).value, null, `${sheetName}!${row}:${column}`);
        }
      }
    }
  }
}

test('health and repeated sync generate one controlled report with three extinguishers', async (context) => {
  const { database, reportService, baseUrl } = await testServer(context);
  const templateHashBefore = fileHash(templatePath);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as { ok: boolean }).ok, true);

  const inspection = payload();
  const first = await fetch(`${baseUrl}/api/inspections/extinguishers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as {
    ok: boolean;
    report: { id: string; filename: string; downloadUrl: string; generatedAt: string };
  };
  assert.equal(firstBody.ok, true);
  assert.match(firstBody.report.filename, /^Reporte_Extintores_Bodega_Caribe_2026-07-13_inspection-p\.xlsx$/);

  const repeated = await fetch(`${baseUrl}/api/inspections/extinguishers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json() as { report: { id: string } };
  assert.equal(repeatedBody.report.id, firstBody.report.id);
  assert.equal(database.inspectionCount(inspection.inspectionId), 1);
  assert.equal(database.extinguisherCount(inspection.inspectionId), 3);
  assert.equal(database.reportCount(inspection.inspectionId), 1);
  assert.equal(fileHash(templatePath), templateHashBefore);

  const report = database.getReport(firstBody.report.id);
  assert.ok(report);
  assert.equal(report.status, 'generated');
  assert.ok(fs.existsSync(report.file_path));

  const templateBook = new ExcelJS.Workbook();
  const reportBook = new ExcelJS.Workbook();
  await templateBook.xlsx.readFile(templatePath);
  await reportBook.xlsx.readFile(report.file_path);
  const templateSheet = templateBook.getWorksheet('EXTINTORES');
  const reportSheet = reportBook.getWorksheet('EXTINTORES');
  assert.ok(templateSheet && reportSheet);

  assert.equal(reportSheet.getCell('F9').value, 'Bodega Caribe');
  assert.equal(reportSheet.getCell('F10').value, 'EXTINTORES');
  assert.equal(reportSheet.getCell('F11').value, '2026-07-13');
  assert.equal(reportSheet.getCell('A14').value, '1');
  assert.equal(reportSheet.getCell('A15').value, '2');
  assert.equal(reportSheet.getCell('A16').value, '3');
  assert.equal(reportSheet.getCell('R14').value, 'Sí');
  assert.equal(reportSheet.getCell('Y14').value, 'No');
  assert.equal(reportSheet.getCell('AC14').value, 'N/A');
  assert.equal(
    reportSheet.getCell('AG14').value,
    'Requiere mantenimiento.\nPresión: manómetro fuera de rango\nPintura: deteriorada\nManguera: presenta grietas'
  );
  for (let row = 17; row <= 128; row += 1) {
    for (let column = 1; column <= 35; column += 1) {
      assert.equal(reportSheet.getCell(row, column).value, null, `Expected empty cell at row ${row}, column ${column}`);
    }
  }
  assert.deepEqual([...reportSheet.model.merges].sort(), [...templateSheet.model.merges].sort());
  for (const property of ['orientation', 'scale', 'fitToWidth', 'fitToHeight', 'printTitlesRow', 'printTitlesColumn', 'showGridLines', 'horizontalCentered'] as const) {
    assert.equal(reportSheet.pageSetup[property], templateSheet.pageSetup[property]);
  }
  assert.deepEqual(reportSheet.pageSetup.margins, templateSheet.pageSetup.margins);
  assert.equal(reportSheet.getImages().length, templateSheet.getImages().length);
  assert.ok(reportSheet.getImages().length > 0, 'Expected the template logo to be preserved');
  assert.equal(reportSheet.getColumn(3).width, templateSheet.getColumn(3).width);
  assert.equal(reportSheet.getRow(14).height, templateSheet.getRow(14).height);
  assert.deepEqual(reportSheet.getCell('A14').border, templateSheet.getCell('A14').border);
  assertUnselectedVariableAreasAreEmpty(reportBook, ['EXTINTORES']);

  const list = await fetch(`${baseUrl}/api/reports`);
  assert.equal(list.status, 200);
  const listBody = await list.json() as { reports: Array<{ id: string; downloadUrl: string }> };
  assert.equal(listBody.reports.length, 1);
  assert.equal(listBody.reports[0].id, firstBody.report.id);

  const download = await fetch(`${baseUrl}${firstBody.report.downloadUrl}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') ?? '', /attachment/i);
  assert.ok((await download.arrayBuffer()).byteLength > 1000);
  assert.equal(reportService.resolveDownload('../../template') , undefined);
});

test('invalid duplicate extinguisher ids return 400 without saving data', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspection = payload('invalid');
  inspection.extinguishers[1].id = inspection.extinguishers[0].id;
  const response = await fetch(`${baseUrl}/api/inspections/extinguishers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inspection),
  });
  assert.equal(response.status, 400);
  assert.equal(database.inspectionCount('invalid'), 0);
  assert.equal(database.reportCount('invalid'), 0);
});

test('three hydrants persist, generate the HIDRANTES sheet and remain idempotent', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const templateHashBefore = fileHash(templatePath);
  const inspection = hydrantPayload();

  const first = await fetch(`${baseUrl}/api/inspections/hydrants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as { report: { id: string; filename: string } };
  assert.match(firstBody.report.filename, /^Reporte_Hidrantes_Hotel_Piloto_2026-07-21_inspection-h\.xlsx$/);

  const repeated = await fetch(`${baseUrl}/api/inspections/hydrants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json() as { report: { id: string } };
  assert.equal(repeatedBody.report.id, firstBody.report.id);
  assert.equal(database.inspectionCount(inspection.inspectionId), 1);
  assert.equal(database.hydrantCount(inspection.inspectionId), 3);
  assert.equal(database.reportCount(inspection.inspectionId), 1);
  assert.equal(fileHash(templatePath), templateHashBefore);

  const report = database.getReport(firstBody.report.id);
  assert.ok(report);
  const templateBook = new ExcelJS.Workbook();
  const reportBook = new ExcelJS.Workbook();
  await templateBook.xlsx.readFile(templatePath);
  await reportBook.xlsx.readFile(report.file_path);
  const templateSheet = templateBook.getWorksheet('HIDRANTES');
  const reportSheet = reportBook.getWorksheet('HIDRANTES');
  assert.ok(templateSheet && reportSheet);
  assertUnselectedVariableAreasAreEmpty(reportBook, ['HIDRANTES']);
  assert.equal(reportSheet.getCell('F8').value, 'Hotel Piloto');
  assert.equal(reportSheet.getCell('F9').value, 'RED DE HIDRANTES');
  assert.equal(reportSheet.getCell('F10').value, '2026-07-21');
  assert.equal(reportSheet.getCell('A13').value, '1');
  assert.equal(reportSheet.getCell('C13').value, 'Ubicación hidrante 1');
  assert.equal(reportSheet.getCell('L13').value, 'Sí');
  assert.equal(reportSheet.getCell('O13').value, 'No');
  assert.equal(reportSheet.getCell('Q13').value, 'N/A');
  assert.equal(reportSheet.getCell('AD13').value, 'Requiere señal nueva.\nSeñalamiento: Señal deteriorada');
  for (let row = 16; row <= 50; row += 1) {
    for (let column = 1; column <= 35; column += 1) {
      assert.equal(reportSheet.getCell(row, column).value, null, `Expected empty hydrant cell at ${row}, ${column}`);
    }
  }
  assert.deepEqual([...reportSheet.model.merges].sort(), [...templateSheet.model.merges].sort());
  assert.equal(reportSheet.getImages().length, templateSheet.getImages().length);
  assert.equal(reportSheet.getColumn(3).width, templateSheet.getColumn(3).width);
  assert.deepEqual(reportSheet.getCell('A13').border, templateSheet.getCell('A13').border);
});

test('two extinguishers plus two hydrants produce one general workbook', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-mixed-001';
  const extinguisherInspection = payload(inspectionId);
  extinguisherInspection.extinguishers = extinguisherInspection.extinguishers.slice(0, 2);
  const extinguisherResponse = await fetch(`${baseUrl}/api/inspections/extinguishers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extinguisherInspection),
  });
  assert.equal(extinguisherResponse.status, 201);
  const extinguisherBody = await extinguisherResponse.json() as { report: { id: string } };

  const hydrantInspection = hydrantPayload(inspectionId, 2);
  hydrantInspection.company = extinguisherInspection.company as { id: string; name: string };
  hydrantInspection.date = extinguisherInspection.date;
  const hydrantResponse = await fetch(`${baseUrl}/api/inspections/hydrants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hydrantInspection),
  });
  assert.equal(hydrantResponse.status, 200);
  const hydrantBody = await hydrantResponse.json() as { report: { id: string; filename: string } };
  assert.equal(hydrantBody.report.id, extinguisherBody.report.id);
  assert.match(hydrantBody.report.filename, /^Reporte_Inspeccion_/);
  assert.equal(database.extinguisherCount(inspectionId), 2);
  assert.equal(database.hydrantCount(inspectionId), 2);
  assert.equal(database.reportCount(inspectionId), 1);

  const report = database.getReport(hydrantBody.report.id);
  assert.ok(report);
  assert.equal(report.formats, 'Extintores, Hidrantes');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(report.file_path);
  assertUnselectedVariableAreasAreEmpty(book, ['EXTINTORES', 'HIDRANTES']);
  assert.equal(book.getWorksheet('EXTINTORES')?.getCell('A14').value, '1');
  assert.equal(book.getWorksheet('EXTINTORES')?.getCell('A15').value, '2');
  assert.equal(book.getWorksheet('HIDRANTES')?.getCell('A13').value, '1');
  assert.equal(book.getWorksheet('HIDRANTES')?.getCell('A14').value, '2');

  const list = await (await fetch(`${baseUrl}/api/reports`)).json() as { reports: Array<{ formats: string }> };
  assert.equal(list.reports.length, 1);
  assert.equal(list.reports[0].formats, 'Extintores, Hidrantes');
});

test('duplicate hydrant ids and more than 38 records are rejected', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const duplicate = hydrantPayload('invalid-hydrants-duplicate');
  duplicate.hydrants[1].id = duplicate.hydrants[0].id;
  const duplicateResponse = await fetch(`${baseUrl}/api/inspections/hydrants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicate),
  });
  assert.equal(duplicateResponse.status, 400);
  assert.equal(database.inspectionCount(duplicate.inspectionId), 0);

  const tooMany = hydrantPayload('invalid-hydrants-limit', 39);
  const limitResponse = await fetch(`${baseUrl}/api/inspections/hydrants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tooMany),
  });
  assert.equal(limitResponse.status, 400);
  assert.equal(database.inspectionCount(tooMany.inspectionId), 0);
});

test('admin catalog persists companies, branches and filtered equipment locations', async (context) => {
  const { databasePath, baseUrl } = await testServer(context);

  const createCompany = () => fetch(`${baseUrl}/api/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bodega Caribe', businessName: 'Bodega Caribe SA de CV', active: true }),
  });
  const firstCompanyResponse = await createCompany();
  assert.equal(firstCompanyResponse.status, 201);
  const firstCompany = await firstCompanyResponse.json() as { company: { id: string } };
  const repeatedCompanyResponse = await fetch(`${baseUrl}/api/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '  bodega   caribe  ', businessName: '', active: true }),
  });
  assert.equal(repeatedCompanyResponse.status, 200);
  const repeatedCompany = await repeatedCompanyResponse.json() as { company: { id: string }; created: boolean };
  assert.equal(repeatedCompany.created, false);
  assert.equal(repeatedCompany.company.id, firstCompany.company.id);

  const editedCompany = await fetch(`${baseUrl}/api/companies/${firstCompany.company.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bodega Caribe', businessName: 'Bodega Caribe, S.A. de C.V.', active: true }),
  });
  assert.equal(editedCompany.status, 200);
  const disabledCompany = await fetch(`${baseUrl}/api/companies/${firstCompany.company.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
  });
  assert.equal(disabledCompany.status, 200);
  const emptyCatalog = await (await fetch(`${baseUrl}/api/mobile/catalog`)).json() as { companies: unknown[] };
  assert.equal(emptyCatalog.companies.length, 0);
  await fetch(`${baseUrl}/api/companies/${firstCompany.company.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: true }),
  });

  const branchResponse = await fetch(`${baseUrl}/api/companies/${firstCompany.company.id}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sucursal Centro', address: 'Av. Tulum 100', active: true }),
  });
  assert.equal(branchResponse.status, 201);
  const branch = await branchResponse.json() as { branch: { id: string } };

  const createLocation = async (
    equipmentType: 'extinguisher' | 'hydrant' | 'addressed_device'
      | 'conventional_device' | 'notification_device',
    name: string
  ) => {
    const response = await fetch(`${baseUrl}/api/companies/${firstCompany.company.id}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: branch.branch.id,
        equipmentType,
        name,
        area: 'Planta baja',
        floor: '1',
        reference: 'Junto a recepción',
        active: true,
      }),
    });
    assert.equal(response.status, 201);
    return (await response.json() as { location: { id: string } }).location;
  };
  const extinguisherLocation = await createLocation('extinguisher', 'Acceso principal');
  await createLocation('hydrant', 'Patio de maniobras');
  await createLocation('addressed_device', 'Pasillo principal');
  await createLocation('conventional_device', 'Cuarto de máquinas');
  await createLocation('notification_device', 'Vestíbulo');

  const filtered = await fetch(`${baseUrl}/api/companies/${firstCompany.company.id}/locations?equipmentType=extinguisher`);
  const filteredBody = await filtered.json() as { locations: Array<{ equipmentType: string }> };
  assert.equal(filteredBody.locations.length, 1);
  assert.equal(filteredBody.locations[0].equipmentType, 'extinguisher');

  await fetch(`${baseUrl}/api/locations/${extinguisherLocation.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
  });
  const catalogWithoutInactive = await fetch(`${baseUrl}/api/mobile/catalog`);
  const inactiveCatalog = await catalogWithoutInactive.json() as { companies: Array<{ locations: Array<{ id: string }> }> };
  assert.equal(inactiveCatalog.companies[0].locations.some((location) => location.id === extinguisherLocation.id), false);

  await fetch(`${baseUrl}/api/locations/${extinguisherLocation.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: true }),
  });
  await fetch(`${baseUrl}/api/branches/${branch.branch.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
  });
  const catalogWithoutInactiveBranch = await (await fetch(`${baseUrl}/api/mobile/catalog`)).json() as { companies: Array<{ locations: unknown[] }> };
  assert.equal(catalogWithoutInactiveBranch.companies[0].locations.length, 0);

  const reopened = new AdminRepository(databasePath);
  assert.equal(reopened.listCompanies({ search: 'caribe' }).length, 1);
  assert.equal(reopened.listLocations(firstCompany.company.id, {}).length, 5);
  reopened.close();

  const adminPage = await fetch(`${baseUrl}/admin`);
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /ExtinCheck/);
});

test('optional seed is repeatable without duplicating example data', async (context) => {
  const { adminRepository } = await testServer(context);
  adminRepository.seedExampleData();
  adminRepository.seedExampleData();
  const companies = adminRepository.listCompanies({ search: 'Bodega Caribe' });
  assert.equal(companies.length, 1);
  assert.equal(adminRepository.listLocations(companies[0].id, { equipmentType: 'extinguisher' }).length, 3);
  assert.equal(adminRepository.listLocations(companies[0].id, { equipmentType: 'hydrant' }).length, 2);
  assert.equal(adminRepository.listLocations(companies[0].id, { equipmentType: 'addressed_device' }).length, 1);
  assert.equal(adminRepository.listLocations(companies[0].id, { equipmentType: 'conventional_device' }).length, 1);
  assert.equal(adminRepository.listLocations(companies[0].id, { equipmentType: 'notification_device' }).length, 1);
});

test('a generation failure keeps the inspection and records the report error', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-server-error-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = new LocalDatabase(databasePath);
  const adminRepository = new AdminRepository(databasePath);
  const reportService = new ExtinguisherReportService(
    database,
    path.join(directory, 'missing-template.xlsx'),
    path.join(directory, 'reports')
  );
  const server = createApp(
    database,
    reportService,
    adminRepository,
    path.join(serverRoot, 'admin-web', 'dist'),
    createTestSecurityConfig({ bypassAuthenticationForTests: true })
  ).listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    adminRepository.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const inspection = payload('inspection-error-001');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/inspections/extinguishers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(response.status, 500);
  assert.equal(database.inspectionCount(inspection.inspectionId), 1);
  assert.equal(database.extinguisherCount(inspection.inspectionId), 3);
  const report = database.listReports()[0];
  assert.equal(report.status, 'error');
  assert.match(report.error_message ?? '', /template not found/i);
  const reportList = await fetch(`http://127.0.0.1:${address.port}/api/reports`);
  const reportListBody = await reportList.json() as { reports: Array<{ status: string; errorMessage: string }> };
  assert.equal(reportListBody.reports[0].status, 'error');
  assert.equal(reportListBody.reports[0].errorMessage, 'No fue posible generar el reporte.');
  assert.doesNotMatch(reportListBody.reports[0].errorMessage, /template|sqlite|\.xlsx|\\/i);
});

test('Ansul synchronizes atomically, is idempotent and fills the official sheet', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const templateHashBefore = fileHash(templatePath);
  const body = ansulPayload();
  const first = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as {
    syncedFormatIds: string[]; unsupportedFormatIds: string[]; syncStatus: string;
    ansulFormsReceived: number; report: { id: string };
  };
  assert.deepEqual(firstBody.syncedFormatIds, ['ansul_r102']);
  assert.deepEqual(firstBody.unsupportedFormatIds, []);
  assert.equal(firstBody.syncStatus, 'synced');
  assert.equal(firstBody.ansulFormsReceived, 1);

  const repeated = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json() as { report: { id: string } };
  assert.equal(repeatedBody.report.id, firstBody.report.id);
  assert.equal(database.inspectionCount(body.inspectionId), 1);
  assert.equal(database.reportCount(body.inspectionId), 1);
  const reportData = database.getInspectionReportData(body.inspectionId);
  assert.equal(reportData?.ansul?.answers.length, 17);
  assert.equal(reportData?.ansul?.systemName, 'Sistema cocina principal');
  assert.equal(reportData?.ansul?.answers[0].quantity, '2.0');
  assert.equal(reportData?.ansul?.answers[0].model, 'R-102-A');

  const report = database.getReport(firstBody.report.id);
  assert.ok(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.file_path);
  const sheet = workbook.getWorksheet('Ansul R-102');
  assert.ok(sheet);
  assert.equal(sheet.getCell('F9').value, 'Restaurante Piloto');
  assert.equal(sheet.getCell('F10').value, 'Mantenimiento');
  assert.equal(sheet.getCell('F11').value, 'Cocina general');
  assert.equal(sheet.getCell('F12').value, '2026-07-23');
  assert.equal(sheet.getCell('A16').value, 'SISTEMA R-102 CON CAPACIDAD DE 3 GALONES');
  assert.equal(sheet.getCell('Q17').value, 'X');
  assert.equal(sheet.getCell('S18').value, 'X');
  assert.equal(sheet.getCell('U19').value, 'X');
  assert.equal(sheet.getCell('W17').value, 2);
  assert.equal(sheet.getCell('AA17').value, 'R-102-A');
  assert.equal(sheet.getCell('AE17').value, 'Revisión piloto');
  assert.equal(sheet.getCell('F36').value, 'Primera línea conservada.');
  assert.equal(sheet.getCell('F37').value, 'Segunda línea conservada.');
  body.ansul.answers[0].answer = 'no';
  body.ansul.answers[0].quantity = undefined;
  const changed = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(changed.status, 200);
  const regenerated = new ExcelJS.Workbook();
  await regenerated.xlsx.readFile(database.getReport(firstBody.report.id)!.file_path);
  assert.equal(regenerated.getWorksheet('Ansul R-102')!.getCell('Q17').value, null);
  assert.equal(regenerated.getWorksheet('Ansul R-102')!.getCell('U17').value, 'X');
  assert.equal(regenerated.getWorksheet('Ansul R-102')!.getCell('W17').value, null);
  assert.equal(fileHash(templatePath), templateHashBefore);
});

test('Ansul validation rejects missing data, duplicate questionId and invalid answers atomically', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const missing = ansulPayload('inspection-ansul-missing');
  const missingBody = { ...missing, ansul: undefined };
  const missingResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(missingBody),
  });
  assert.equal(missingResponse.status, 400);
  assert.equal(database.inspectionCount(missing.inspectionId), 0);

  const duplicate = ansulPayload('inspection-ansul-duplicate');
  duplicate.ansul.answers.push({ ...duplicate.ansul.answers[0] });
  const duplicateResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicate),
  });
  assert.equal(duplicateResponse.status, 400);
  assert.equal(database.inspectionCount(duplicate.inspectionId), 0);

  const invalid = ansulPayload('inspection-ansul-invalid');
  const invalidBody = {
    ...invalid,
    ansul: {
      ...invalid.ansul,
      answers: invalid.ansul.answers.map((answer, index) =>
        index === 0 ? { ...answer, answer: 'tal_vez' } : answer),
    },
  };
  const invalidResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalidBody),
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(database.inspectionCount(invalid.inspectionId), 0);
});

test('all supported formats share one atomic inspection and one official report', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const ansul = ansulPayload('inspection-all-formats');
  const alarms = alarmPayload(ansul.inspectionId);
  const combined = {
    ...ansul,
    selectedFormatIds: [
      'extintores', 'hidrantes', 'jockey', 'electrica', 'diesel',
      ...ALARM_MOBILE_IDS, 'ansul_r102',
    ],
    extinguishers: [extinguisher('ext-all-1', '1')],
    hydrants: [hydrant('hyd-all-1', '1')],
    firePumps: FIRE_PUMP_FORM_TYPES.map(completeFirePumpForm),
    alarms: alarms.alarms,
  };
  const response = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(combined),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { syncedFormatIds: string[]; syncStatus: string; report: { id: string } };
  assert.deepEqual(body.syncedFormatIds, [
    'extintores', 'hidrantes', 'fire_pumps', 'alarms', 'ansul_r102',
  ]);
  assert.equal(body.syncStatus, 'synced');
  assert.equal(database.reportCount(combined.inspectionId), 1);
  const report = database.getReport(body.report.id);
  assert.ok(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.file_path);
  for (const sheetName of [
    'EXTINTORES', 'HIDRANTES', 'B Jockey', 'B Electrica', 'B Diesel',
    'Tablero A&D', 'Dispositivos A&D', 'Dispositivos Convencionales',
    'Dispositivos Notificacion', 'Ansul R-102', 'FIRMAS',
  ]) assert.ok(workbook.getWorksheet(sheetName), `Missing ${sheetName}`);
});

test('Bombas synchronizes atomically, is idempotent and fills the three official sheets', async (context) => {
  const { database, reportService, baseUrl } = await testServer(context);
  const templateHashBefore = fileHash(templatePath);
  const body = firePumpsPayload();

  const first = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as {
    syncedFormatIds: string[];
    syncStatus: string;
    firePumpFormsReceived: number;
    report: { id: string };
  };
  assert.deepEqual(firstBody.syncedFormatIds, ['fire_pumps']);
  assert.equal(firstBody.syncStatus, 'synced');
  assert.equal(firstBody.firePumpFormsReceived, 3);
  assert.ok(firstBody.report.id);

  const repeated = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json() as { report: { id: string } };
  assert.equal(repeatedBody.report.id, firstBody.report.id);
  const reportData = database.getInspectionReportData(body.inspectionId);
  assert.equal(reportData?.firePumps.length, 3);
  assert.equal(reportData?.firePumps.find((form) => form.formType === 'pump_diesel')?.answers.length,
    body.firePumps.find((form) => form.formType === 'pump_diesel')?.answers.length);
  assert.equal(database.reportCount(body.inspectionId), 1);

  const report = reportService.resolveDownload(firstBody.report.id);
  assert.ok(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.filePath);
  assertUnselectedVariableAreasAreEmpty(workbook, ['B Jockey', 'B Electrica', 'B Diesel']);
  for (const formType of FIRE_PUMP_FORM_TYPES) {
    const config = FIRE_PUMP_CONFIG[formType];
    const sheet = workbook.getWorksheet(config.sheetName);
    assert.ok(sheet);
    assert.equal(sheet.getCell(config.generalCells.cliente).value, body.company.name);
    assert.equal(sheet.getCell(config.generalCells.atencion).value, body.attention);
    assert.equal(sheet.getCell(config.generalCells.area).value, body.area);
    assert.equal(sheet.getCell(config.generalCells.fecha).value, body.date);
    assert.equal(sheet.getCell(config.questions['1_1'].yesCell).value, 'X');
    assert.equal(sheet.getCell(config.questions['1_1'].naCell).value, null);
    assert.equal(sheet.getCell(config.questions['1_1'].noCell).value, null);
    assert.equal(sheet.getCell(config.questions['1_2'].naCell).value, 'X');
    assert.equal(sheet.getCell(config.questions['1_3'].noCell).value, 'X');
    assert.equal(sheet.getCell(config.questions['1_1'].commentCell).value, `Comentario ${config.mobileId}`);
    assert.equal(sheet.getCell(config.observationsCell).value, `Observaciones ${config.mobileId}`);
    assert.equal(sheet.getCell(config.identityCells.potencia).value, 145);
    assert.equal(sheet.getCell(config.identityCells.capacidad).value, '500 GPM');
  }
  assert.equal(workbook.getWorksheet('B Diesel')?.getCell('AA32').value, 13.5);
  assert.equal(workbook.getWorksheet('B Diesel')?.getCell('AA49').value, '13.5');
  assert.equal(workbook.getWorksheet('B Diesel')?.getCell('AA54').value, '13.5');
  assert.equal(workbook.getWorksheet('B Diesel')?.getCell('AA59').value, 145);
  assert.equal(fileHash(templatePath), templateHashBefore);

  const changed = structuredClone(body);
  const jockey = changed.firePumps.find((form) => form.formType === 'pump_jockey')!;
  jockey.answers.find((answer) => answer.questionId === '1_1')!.answer = 'no';
  jockey.updatedAt += 1;
  const regenerated = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
  });
  assert.equal(regenerated.status, 200);
  const regeneratedBody = await regenerated.json() as { report: { id: string } };
  assert.equal(regeneratedBody.report.id, firstBody.report.id);
  const regeneratedBook = new ExcelJS.Workbook();
  await regeneratedBook.xlsx.readFile(reportService.resolveDownload(firstBody.report.id)!.filePath);
  assert.equal(regeneratedBook.getWorksheet('B Jockey')?.getCell('Q17').value, null);
  assert.equal(regeneratedBook.getWorksheet('B Jockey')?.getCell('U17').value, 'X');
});

test('Bombas rejects incomplete groups, duplicate questionIds and invalid answers without saving', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const incomplete = firePumpsPayload('inspection-pumps-incomplete');
  incomplete.selectedFormatIds = ['jockey'];
  incomplete.firePumps = [incomplete.firePumps[0]];
  const incompleteResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(incomplete),
  });
  assert.equal(incompleteResponse.status, 400);
  assert.equal(database.inspectionCount(incomplete.inspectionId), 0);

  const duplicate = firePumpsPayload('inspection-pumps-duplicate');
  duplicate.firePumps[0].answers.push({ ...duplicate.firePumps[0].answers[0] });
  const duplicateResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicate),
  });
  assert.equal(duplicateResponse.status, 400);
  assert.equal(database.inspectionCount(duplicate.inspectionId), 0);

  const invalid = firePumpsPayload('inspection-pumps-invalid-answer') as any;
  invalid.firePumps[2].answers[0].answer = 'talvez';
  const invalidResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalid),
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(database.inspectionCount(invalid.inspectionId), 0);
});

test('Alarmas synchronizes atomically, stores the shared system and fills the four official sheets', async (context) => {
  const { database, reportService, baseUrl } = await testServer(context);
  const templateHashBefore = fileHash(templatePath);
  const body = alarmPayload();

  const first = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as {
    syncedFormatIds: string[];
    syncStatus: string;
    alarmFormsReceived: number;
    alarmDevicesReceived: number;
    report: { id: string };
  };
  assert.deepEqual(firstBody.syncedFormatIds, ['alarms']);
  assert.equal(firstBody.syncStatus, 'synced');
  assert.equal(firstBody.alarmFormsReceived, 4);
  assert.equal(firstBody.alarmDevicesReceived, 3);

  const repeated = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json() as { report: { id: string } };
  assert.equal(repeatedBody.report.id, firstBody.report.id);
  assert.equal(database.reportCount(body.inspectionId), 1);

  const stored = database.getInspectionReportData(body.inspectionId);
  assert.equal(stored?.alarms.systemName, 'Notifier NFS2-3030');
  assert.deepEqual(stored?.alarms.systemNameDiscrepancies, body.alarms.systemNameDiscrepancies);
  assert.equal(stored?.alarms.forms.length, 4);
  assert.equal(stored?.alarms.items.length, 3);
  assert.equal(stored?.alarms.forms.find((form) => form.formType === 'alarm_panel')?.answers.length, 28);
  const reportList = await (await fetch(`${baseUrl}/api/reports`)).json() as {
    reports: Array<{ formats: string; alarmForms: Array<{ formType: string; itemCount: number }> }>;
  };
  assert.equal(reportList.reports[0].formats, 'Alarmas');
  assert.equal(reportList.reports[0].alarmForms.length, 4);
  assert.equal(reportList.reports[0].alarmForms.find(
    (form) => form.formType === 'addressed_devices'
  )?.itemCount, 1);

  const report = reportService.resolveDownload(firstBody.report.id);
  assert.ok(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.filePath);
  assertUnselectedVariableAreasAreEmpty(workbook, [
    'Tablero A&D', 'Dispositivos A&D', 'Dispositivos Convencionales', 'Dispositivos Notificacion',
  ]);
  const panel = workbook.getWorksheet('Tablero A&D');
  assert.ok(panel);
  assert.equal(panel.getCell('F9').value, body.company.name);
  assert.equal(panel.getCell('F10').value, body.attention);
  assert.notEqual(panel.getCell('F10').value, body.alarms.systemName);
  assert.equal(panel.getCell('Q18').value, 'X');
  assert.equal(panel.getCell('S19').value, 'X');
  assert.equal(panel.getCell('U20').value, 'X');
  assert.equal(panel.getCell('W18').value, 'Parámetro piloto');
  assert.equal(panel.getCell('AA18').value, 'Lectura piloto');
  assert.equal(panel.getCell('AE18').value, 'Comentario piloto');
  assert.equal(panel.getCell('F49').value, 'Tablero operando correctamente.');

  for (const [formType, config] of Object.entries(ALARM_DEVICE_CONFIG) as
    Array<[AlarmDeviceFormType, typeof ALARM_DEVICE_CONFIG[AlarmDeviceFormType]]>) {
    const sheet = workbook.getWorksheet(config.sheetName);
    assert.ok(sheet);
    assert.equal(sheet.getCell('F9').value, body.company.name);
    assert.equal(sheet.getCell('F10').value, body.alarms.systemName);
    assert.equal(sheet.getCell('F11').value, body.date);
    const item = stored!.alarms.items.find((candidate) => candidate.formType === formType)!;
    assert.equal(sheet.getCell(`${config.columns.identifier}${config.firstRow}`).value, item.identifier);
    assert.equal(sheet.getCell(`${config.columns.location}${config.firstRow}`).value, item.locationNameSnapshot);
    assert.equal(sheet.getCell(`${config.columns.alarm}${config.firstRow}`).value, 'Sí');
    assert.equal(sheet.getCell(`${config.columns.supervision}${config.firstRow}`).value, 'No');
    assert.equal(sheet.getCell(`${config.columns.cleaning}${config.firstRow}`).value, 'N/A');
    assert.equal(sheet.getCell(`${config.columns.comments}${config.firstRow}`).value, item.observations);
  }
  assert.equal(fileHash(templatePath), templateHashBefore);

  const changed = structuredClone(body);
  changed.alarms.addressedDevices.items = [];
  changed.alarms.addressedDevices.status = 'not_started';
  changed.alarms.systemName = 'Notifier actualizado';
  changed.syncVersion += 1;
  const regenerated = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
  });
  assert.equal(regenerated.status, 200);
  const updated = database.getInspectionReportData(body.inspectionId);
  assert.equal(updated?.alarms.items.length, 2);
  assert.equal(updated?.alarms.systemName, 'Notifier actualizado');
  assert.equal(database.reportCount(body.inspectionId), 1);
});

test('Alarmas validates the atomic group, shared system, duplicate IDs and panel-only exception', async (context) => {
  const { database, baseUrl } = await testServer(context);

  const incomplete = alarmPayload('inspection-alarms-incomplete');
  incomplete.selectedFormatIds = ['tablero_ad'];
  const incompleteResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(incomplete),
  });
  assert.equal(incompleteResponse.status, 400);
  assert.equal(database.inspectionCount(incomplete.inspectionId), 0);

  const noSystem = alarmPayload('inspection-alarms-no-system');
  noSystem.alarms.systemName = '';
  const noSystemResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(noSystem),
  });
  assert.equal(noSystemResponse.status, 400);
  assert.equal(database.inspectionCount(noSystem.inspectionId), 0);

  const duplicate = alarmPayload('inspection-alarms-duplicate');
  duplicate.alarms.notificationDevices.items[0].id = duplicate.alarms.addressedDevices.items[0].id;
  const duplicateResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicate),
  });
  assert.equal(duplicateResponse.status, 400);
  assert.equal(database.inspectionCount(duplicate.inspectionId), 0);

  const unknownQuestion = alarmPayload('inspection-alarms-unknown-question');
  unknownQuestion.alarms.panel.answers.push({
    questionId: 'legacy_position_29',
    answer: 'si',
    parameter: '',
    reading: '',
    comment: '',
  });
  const unknownQuestionResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(unknownQuestion),
  });
  assert.equal(unknownQuestionResponse.status, 400);
  assert.equal(database.inspectionCount(unknownQuestion.inspectionId), 0);

  const panelOnly = alarmPayload('inspection-alarms-panel-only');
  panelOnly.alarms.systemName = '';
  for (const form of [
    panelOnly.alarms.addressedDevices,
    panelOnly.alarms.conventionalDevices,
    panelOnly.alarms.notificationDevices,
  ]) {
    form.status = 'not_applicable';
    form.items = [];
  }
  const panelOnlyResponse = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(panelOnly),
  });
  assert.equal(panelOnlyResponse.status, 201);
  assert.equal(database.getInspectionReportData(panelOnly.inspectionId)?.alarms.systemName, '');
});

test('Bombas, Extintores, Hidrantes, firma and pump evidence share one official report', async (context) => {
  const { database, reportService, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-all-supported-formats';
  const body = {
    ...firePumpsPayload(inspectionId),
    extinguishers: payload(inspectionId).extinguishers,
    hydrants: hydrantPayload(inspectionId, 2).hydrants,
    selectedFormatIds: ['extintores', 'hidrantes', 'jockey', 'electrica', 'diesel'],
  };
  const sync = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(sync.status, 201);
  const syncBody = await sync.json() as { syncedFormatIds: string[]; report: { id: string } };
  assert.deepEqual(syncBody.syncedFormatIds, ['extintores', 'hidrantes', 'fire_pumps']);
  assert.equal(database.reportCount(inspectionId), 1);

  const evidenceId = '99999999-9999-4999-8999-999999999999';
  const pumpEvidence = {
    evidenceId,
    formatType: 'fire_pumps',
    formType: 'pump_diesel',
    itemId: null,
    fieldKey: 'diesel:photo_general',
    caption: 'Tablero de bomba diésel',
    locationNameSnapshot: 'Cuarto de bombas',
    capturedAt: '2026-07-23T18:00:00.000Z',
    updatedAt: '2026-07-23T18:00:00.000Z',
  };
  const upload = await uploadEvidence(baseUrl, inspectionId, pumpEvidence);
  assert.equal(upload.status, 201);
  const finalize = await fetch(`${baseUrl}/api/inspections/${inspectionId}/evidence/finalize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidenceIds: [evidenceId] }),
  });
  assert.equal(finalize.status, 200);
  const finalizeBody = await finalize.json() as { report: { id: string }; evidenceCount: number };
  assert.equal(finalizeBody.report.id, syncBody.report.id);
  assert.equal(finalizeBody.evidenceCount, 1);
  assert.equal(database.listInspectionEvidence(inspectionId)[0].form_type, 'pump_diesel');

  const resolved = reportService.resolveDownload(syncBody.report.id);
  assert.ok(resolved);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolved.filePath);
  assert.equal(workbook.getWorksheet('EXTINTORES')?.getCell('A14').value, '1');
  assert.equal(workbook.getWorksheet('HIDRANTES')?.getCell('A13').value, '1');
  assert.equal(workbook.getWorksheet('B Jockey')?.getCell('Q17').value, 'X');
  assert.equal(workbook.getWorksheet('B Electrica')?.getCell('Q17').value, 'X');
  assert.equal(workbook.getWorksheet('B Diesel')?.getCell('Q17').value, 'X');
  assert.ok(workbook.getWorksheet('FIRMAS'));
  assert.ok(workbook.getWorksheet('EVIDENCIAS'));
  const reportZip = await JSZip.loadAsync(fs.readFileSync(resolved.filePath));
  assert.equal(Object.keys(reportZip.files)
    .filter((name) => /^xl\/media\/evidence\d+-\d+\./.test(name)).length, 1);
});

test('atomic sync accepts Extintores and Hidrantes together in one report', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-atomic-combined';
  const response = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload(inspectionId), hydrants: hydrantPayload(inspectionId, 2).hydrants,
      selectedFormatIds: ['extintores', 'hidrantes'],
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { syncedFormatIds: string[]; syncStatus: string; report: { id: string } };
  assert.deepEqual(body.syncedFormatIds, ['extintores', 'hidrantes']);
  assert.equal(body.syncStatus, 'synced');
  assert.equal(database.extinguisherCount(inspectionId), 3);
  assert.equal(database.hydrantCount(inspectionId), 2);
  assert.equal(database.reportCount(inspectionId), 1);
});

test('atomic sync rolls back inspection data when report generation fails', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-atomic-error-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = new LocalDatabase(databasePath);
  const adminRepository = new AdminRepository(databasePath);
  const reportService = new ExtinguisherReportService(database, path.join(directory, 'missing.xlsx'), path.join(directory, 'reports'));
  const server = createApp(
    database,
    reportService,
    adminRepository,
    path.join(serverRoot, 'admin-web', 'dist'),
    createTestSecurityConfig({ bypassAuthenticationForTests: true })
  ).listen(0, '127.0.0.1');
  context.after(() => { server.close(); adminRepository.close(); database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const inspection = { ...payload('inspection-atomic-error'), selectedFormatIds: ['extintores'] };
  const response = await fetch(`http://127.0.0.1:${address.port}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(response.status, 500);
  assert.equal(database.inspectionCount(inspection.inspectionId), 0);
  assert.equal(database.extinguisherCount(inspection.inspectionId), 0);
});

test('legacy selected formats migrate from existing child rows without data loss', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-migration-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  let database = new LocalDatabase(databasePath);
  const inspection = payload('inspection-legacy-migration');
  database.upsertInspection(inspection);
  database.close();
  database = new LocalDatabase(databasePath);
  assert.equal(database.extinguisherCount(inspection.inspectionId), 3);
  assert.deepEqual(database.getInspectionReportData(inspection.inspectionId)?.inspection.selectedFormatIds, ['extintores']);
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('a failed regeneration preserves the previous valid report and exposes a warning', async (context) => {
  const { database, adminRepository, baseUrl } = await testServer(context);
  const inspection = {
    ...payload('inspection-preserve-report'), selectedFormatIds: ['extintores'],
    signature: technicianSignature('Firma original'),
  };
  const generated = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(generated.status, 201);
  const generatedBody = await generated.json() as { report: { id: string; downloadUrl: string } };
  const originalSignature = database.getInspectionSignature(inspection.inspectionId)!;

  const brokenDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-preserve-error-'));
  const brokenService = new ExtinguisherReportService(database, path.join(brokenDirectory, 'missing.xlsx'), path.join(brokenDirectory, 'reports'));
  const brokenServer = createApp(
    database,
    brokenService,
    adminRepository,
    path.join(serverRoot, 'admin-web', 'dist'),
    createTestSecurityConfig({ bypassAuthenticationForTests: true })
  ).listen(0, '127.0.0.1');
  context.after(() => { brokenServer.close(); fs.rmSync(brokenDirectory, { recursive: true, force: true }); });
  await new Promise<void>((resolve) => brokenServer.once('listening', resolve));
  const address = brokenServer.address();
  assert.ok(address && typeof address === 'object');
  const failed = await fetch(`http://127.0.0.1:${address.port}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...inspection, syncVersion: 101,
      signature: technicianSignature('Firma que debe revertirse', '2026-07-22T20:00:00.000Z'),
    }),
  });
  assert.equal(failed.status, 500);

  const report = database.getReport(generatedBody.report.id);
  assert.equal(report?.status, 'generated');
  assert.equal(report?.last_attempt_status, 'error');
  assert.match(report?.last_attempt_error ?? '', /template not found/i);
  assert.equal((await fetch(`${baseUrl}${generatedBody.report.downloadUrl}`)).status, 200);
  const reportList = await (await fetch(`${baseUrl}/api/reports`)).json() as {
    reports: Array<{ lastAttemptStatus: string; downloadUrl: string }>;
  };
  assert.equal(reportList.reports[0].lastAttemptStatus, 'error');
  assert.ok(reportList.reports[0].downloadUrl);
  assert.equal(database.getInspectionSignature(inspection.inspectionId)?.file_path, originalSignature.file_path);
  assert.equal(database.getInspectionSignature(inspection.inspectionId)?.signer_name, 'Firma original');
  assert.equal(fs.existsSync(originalSignature.file_path), true);
});

test('atomic sync stores a valid technician signature and embeds one image in FIRMAS', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspection = {
    ...payload('inspection-signature-valid'), selectedFormatIds: ['extintores'],
    signature: technicianSignature(),
  };
  const templateHash = fileHash(templatePath);
  const response = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { report: { id: string } };
  assert.equal(database.signatureCount(inspection.inspectionId), 1);
  const stored = database.getInspectionSignature(inspection.inspectionId);
  assert.ok(stored && fs.existsSync(stored.file_path));
  assert.equal(stored.signer_name, 'Daniel Cocom');

  const report = database.getReport(body.report.id);
  assert.ok(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.file_path);
  const signaturesSheet = workbook.getWorksheet('FIRMAS');
  assert.ok(signaturesSheet);
  assert.equal(signaturesSheet.getCell('I30').value, 'Daniel Cocom');
  assert.equal(signaturesSheet.getImages().length, 1);
  assert.equal(workbook.getWorksheet('EXTINTORES')?.getImages().length, 1, 'Template logo must remain');
  assert.equal(fileHash(templatePath), templateHash);

  const listed = await (await fetch(`${baseUrl}/api/reports`)).json() as {
    reports: Array<{ signatureAvailable: boolean; signatureSignerName: string; signatureSignedAt: string }>;
  };
  assert.equal(listed.reports[0].signatureAvailable, true);
  assert.equal(listed.reports[0].signatureSignerName, 'Daniel Cocom');
  assert.equal(listed.reports[0].signatureSignedAt, inspection.signature.signedAt);
});

test('resynchronizing replaces the technician signature without duplicate rows or images', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-signature-replace';
  const firstPayload = { ...payload(inspectionId), selectedFormatIds: ['extintores'], signature: technicianSignature() };
  assert.equal((await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(firstPayload),
  })).status, 201);
  const firstSignature = database.getInspectionSignature(inspectionId)!;
  const secondPayload = {
    ...firstPayload, syncVersion: 2,
    signature: technicianSignature('Daniel Cocom actualizado', '2026-07-22T19:00:00.000Z'),
  };
  const second = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(secondPayload),
  });
  assert.equal(second.status, 200);
  assert.equal(database.signatureCount(inspectionId), 1);
  const current = database.getInspectionSignature(inspectionId)!;
  assert.notEqual(current.file_path, firstSignature.file_path);
  assert.equal(fs.existsSync(firstSignature.file_path), false);
  assert.equal(fs.existsSync(current.file_path), true);
  const report = database.listReports().find((item) => item.inspection_id === inspectionId)!;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.file_path);
  assert.equal(workbook.getWorksheet('FIRMAS')?.getImages().length, 1);
  assert.equal(workbook.getWorksheet('FIRMAS')?.getCell('I30').value, 'Daniel Cocom actualizado');
});

test('invalid or oversized signatures are rejected before changing inspection data', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-signature-invalid';
  const valid = { ...payload(inspectionId), selectedFormatIds: ['extintores'], signature: technicianSignature() };
  assert.equal((await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid),
  })).status, 201);
  const before = database.getInspectionSignature(inspectionId)!;
  const invalidMime = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valid, syncVersion: 2, signature: { ...valid.signature, mimeType: 'image/jpeg' } }),
  });
  assert.equal(invalidMime.status, 400);
  const oversized = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valid, syncVersion: 3, signature: { ...valid.signature, dataBase64: 'A'.repeat(1_500_000) } }),
  });
  assert.equal(oversized.status, 400);
  const oversizedRequest = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valid, syncVersion: 4, signature: { ...valid.signature, dataBase64: 'A'.repeat(2_100_000) } }),
  });
  assert.equal(oversizedRequest.status, 413);
  assert.equal(database.signatureCount(inspectionId), 1);
  assert.equal(database.getInspectionSignature(inspectionId)?.file_path, before.file_path);
  assert.equal(database.getInspectionReportData(inspectionId)?.inspection.selectedFormatIds.join(','), 'extintores');
});

test('evidence upload is idempotent, secure and appears in the official workbook', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-evidence-valid';
  const templateHash = fileHash(templatePath);
  const metadata = evidenceMetadata();
  const inspection = { ...payload(inspectionId), selectedFormatIds: ['extintores'], signature: technicianSignature(), evidenceManifest: [metadata] };
  const synced = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inspection),
  });
  assert.equal(synced.status, 201);
  assert.equal((await synced.json() as { report: null }).report, null);

  const first = await uploadEvidence(baseUrl, inspectionId, metadata);
  assert.equal(first.status, 201);
  const second = await uploadEvidence(baseUrl, inspectionId, metadata);
  assert.equal(second.status, 200);
  assert.equal(database.listInspectionEvidence(inspectionId).length, 1);
  const stored = database.getEvidence(metadata.evidenceId)!;
  assert.ok(fs.existsSync(stored.file_path));
  assert.equal(stored.checksum.length, 64);

  const duplicate = await uploadEvidence(baseUrl, inspectionId, evidenceMetadata('22222222-2222-4222-8222-222222222222'));
  assert.equal(duplicate.status, 409);
  const invalidItem = await uploadEvidence(baseUrl, inspectionId, evidenceMetadata('33333333-3333-4333-8333-333333333333', 'another-inspection-item'));
  assert.equal(invalidItem.status, 400);
  const invalidMime = await uploadEvidence(baseUrl, inspectionId, evidenceMetadata('44444444-4444-4444-8444-444444444444'),
    Buffer.from(signaturePngBase64, 'base64'), 'image/jpeg');
  assert.equal(invalidMime.status, 400);

  const finalized = await fetch(`${baseUrl}/api/inspections/${inspectionId}/evidence/finalize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceIds: [metadata.evidenceId] }),
  });
  assert.equal(finalized.status, 200);
  const body = await finalized.json() as { report: { id: string } };
  const report = database.getReport(body.report.id)!;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(report.file_path);
  const reportZip = await JSZip.loadAsync(fs.readFileSync(report.file_path));
  assert.equal(Object.keys(reportZip.files).filter((name) => /^xl\/media\/evidence\d+-\d+\./.test(name)).length, 1);
  const evidenceDrawing = await Promise.all(Object.keys(reportZip.files).filter((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name))
    .map((name) => reportZip.file(name)!.async('string')));
  assert.equal(evidenceDrawing.some((xml) => xml.includes(`Evidencia ${metadata.evidenceId}`)), true);
  assert.equal(workbook.getWorksheet('FIRMAS')?.getImages().length, 1);
  assert.equal(workbook.getWorksheet('EXTINTORES')?.getImages().length, 1);
  const listed = await (await fetch(`${baseUrl}/api/reports/${body.report.id}/evidence`)).json() as { evidence: unknown[] };
  assert.equal(listed.evidence.length, 1);
  assert.equal((await fetch(`${baseUrl}/api/evidence/${metadata.evidenceId}/file`)).status, 200);
  const regenerated = await fetch(`${baseUrl}/api/inspections/${inspectionId}/evidence/finalize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceIds: [metadata.evidenceId] }),
  });
  assert.equal(regenerated.status, 200);
  const regeneratedZip = await JSZip.loadAsync(fs.readFileSync(database.getReport(body.report.id)!.file_path));
  assert.equal(Object.keys(regeneratedZip.files).filter((name) => /^xl\/media\/evidence\d+-\d+\./.test(name)).length, 1);
  assert.equal(fileHash(templatePath), templateHash);
});

test('oversized evidence is rejected and deletion removes it from the regenerated report', async (context) => {
  const { database, baseUrl } = await testServer(context);
  const inspectionId = 'inspection-evidence-delete';
  const metadata = evidenceMetadata();
  await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload(inspectionId), selectedFormatIds: ['extintores'], evidenceManifest: [metadata] }),
  });
  assert.equal((await uploadEvidence(baseUrl, inspectionId, metadata)).status, 201);
  const oversized = await uploadEvidence(baseUrl, inspectionId, evidenceMetadata('55555555-5555-4555-8555-555555555555'), Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png');
  assert.equal(oversized.status, 413);
  const stored = database.getEvidence(metadata.evidenceId)!;
  assert.equal((await fetch(`${baseUrl}/api/inspections/${inspectionId}/evidence/${metadata.evidenceId}`, { method: 'DELETE' })).status, 200);
  assert.equal(database.listInspectionEvidence(inspectionId).length, 0);
  assert.equal(fs.existsSync(stored.file_path), false);
  const finalized = await fetch(`${baseUrl}/api/inspections/${inspectionId}/evidence/finalize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceIds: [] }),
  });
  const reportId = (await finalized.json() as { report: { id: string } }).report.id;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(database.getReport(reportId)!.file_path);
  assert.equal(workbook.getWorksheet('EVIDENCIAS')?.getImages().length, 0);
});
