import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { AdminRepository } from '../src/admin-repository.js';
import { createApp } from '../src/app.js';
import { LocalDatabase } from '../src/database.js';
import { ExtinguisherReportService } from '../src/report-generator.js';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const templatePath = path.join(serverRoot, 'templates', 'FORMATOS P.R. CANCUN.xlsx');

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

async function testServer(context: Parameters<typeof test>[1] extends (context: infer C) => unknown ? C : never) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-server-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = new LocalDatabase(databasePath);
  const adminRepository = new AdminRepository(databasePath);
  const reportService = new ExtinguisherReportService(database, templatePath, path.join(directory, 'reports'));
  const server = createApp(database, [], reportService, adminRepository, path.join(serverRoot, 'admin-web', 'dist')).listen(0, '127.0.0.1');
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

  const createLocation = async (equipmentType: 'extinguisher' | 'hydrant', name: string) => {
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
  assert.equal(reopened.listLocations(firstCompany.company.id, {}).length, 2);
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
  const server = createApp(database, [], reportService, adminRepository, path.join(serverRoot, 'admin-web', 'dist')).listen(0, '127.0.0.1');
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
  assert.match(reportListBody.reports[0].errorMessage, /template not found/i);
});
