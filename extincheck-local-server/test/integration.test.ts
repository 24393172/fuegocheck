import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { LocalDatabase } from '../src/database.js';

function extinguisher(id: string, numero: string) {
  return {
    id,
    numero,
    ubicacion: `Ubicación ${numero}`,
    tipo_extintor: 'PQS',
    capacidad: '6 KG',
    proxima_recarga: '2027-01',
    presion: 'si' as const,
    presion_comentario: '',
    altura: 'si' as const,
    altura_comentario: '',
    seguro: 'si' as const,
    seguro_comentario: '',
    pintura: 'no' as const,
    pintura_comentario: 'Presenta desgaste',
    manguera: 'si' as const,
    manguera_comentario: '',
    difusor: 'na' as const,
    difusor_comentario: '',
    senalamiento: 'si' as const,
    senalamiento_comentario: '',
    observaciones: '',
    createdAt: 1,
    updatedAt: 2,
  };
}

test('health and repeated sync keep one inspection with three extinguishers', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-server-'));
  const database = new LocalDatabase(path.join(directory, 'test.sqlite'));
  const server = createApp(database, []).listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as { ok: boolean }).ok, true);

  const payload = {
    inspectionId: 'inspection-pilot-001',
    company: { id: null, name: 'Bodega Caribe' },
    date: '2026-07-13',
    technician: { id: null, name: 'Daniel Cocom' },
    extinguishers: [extinguisher('ext-1', '1'), extinguisher('ext-2', '2'), extinguisher('ext-3', '3')],
    syncVersion: 100,
  };
  const first = await fetch(`${baseUrl}/api/inspections/extinguishers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(first.status, 201);
  const repeated = await fetch(`${baseUrl}/api/inspections/extinguishers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(repeated.status, 200);
  assert.equal(database.inspectionCount(payload.inspectionId), 1);
  assert.equal(database.extinguisherCount(payload.inspectionId), 3);
});

test('invalid duplicate extinguisher ids return 400', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-server-'));
  const database = new LocalDatabase(path.join(directory, 'test.sqlite'));
  const server = createApp(database, []).listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/inspections/extinguishers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inspectionId: 'invalid', company: { name: 'Bodega' }, date: '2026-07-13',
      technician: { name: 'Daniel Cocom' },
      extinguishers: [extinguisher('same', '1'), extinguisher('same', '2')], syncVersion: 1,
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(database.inspectionCount('invalid'), 0);
});

