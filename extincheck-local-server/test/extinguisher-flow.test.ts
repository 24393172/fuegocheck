import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredExtinguisher,
  configuredExtinguisherProgress,
  createConfiguredExtinguisher,
} from '../../lib/extinguishers.js';
import { CatalogExtinguisherLocation } from '../../types/catalog.types.js';
import { extinguisherInspectionSchema } from '../src/validation.js';

function location(id: string, identifier: string): CatalogExtinguisherLocation {
  return {
    id,
    companyId: 'company-1',
    equipmentType: 'extinguisher',
    name: `Ubicación ${identifier}`,
    identifier,
    extinguisherType: 'PQS',
    capacity: '6 kg',
    active: true,
    serverUpdatedAt: '2026-07-31T00:00:00.000Z',
    syncedAt: 1,
  };
}

function completeInspectionFields(id: string, identifier: string) {
  return {
    ...createConfiguredExtinguisher(configuredExtinguisher(location(id, identifier))),
    proxima_recarga: '08/2027',
    presion: 'si' as const,
    altura: 'si' as const,
    seguro: 'si' as const,
    pintura: 'si' as const,
    manguera: 'si' as const,
    difusor: 'si' as const,
    senalamiento: 'si' as const,
  };
}

test('three configured extinguishers progress from 0 of 3 to 3 of 3 without a fourth option', () => {
  const configured = [location('ext-1', '1'), location('ext-2', '2'), location('ext-3', '3')];
  const first = completeInspectionFields('ext-1', '1');
  const second = completeInspectionFields('ext-2', '2');
  const third = completeInspectionFields('ext-3', '3');

  let progress = configuredExtinguisherProgress(configured, []);
  assert.deepEqual([progress.inspected, progress.total, progress.available.length], [0, 3, 3]);

  progress = configuredExtinguisherProgress(configured, [first]);
  assert.deepEqual([progress.inspected, progress.total, progress.available.length], [1, 3, 2]);
  assert.equal(progress.available.some((item) => item.id === first.id), false);

  progress = configuredExtinguisherProgress(configured, [first, second, third]);
  assert.deepEqual([progress.inspected, progress.total, progress.available.length], [3, 3, 0]);
});

test('the persistence contract rejects the same configured extinguisher twice', () => {
  const extinguisher = completeInspectionFields('ext-1', '1');
  const {
    locationId: _locationId,
    locationNameSnapshot: _locationNameSnapshot,
    customLocation: _customLocation,
    ...serverRecord
  } = extinguisher;
  const result = extinguisherInspectionSchema.safeParse({
    inspectionId: 'inspection-1',
    company: { id: 'company-1', name: 'Empresa prueba' },
    branch: null,
    date: '2026-07-31',
    technician: { id: null, name: 'Técnico' },
    extinguishers: [serverRecord, serverRecord],
    sourceDeviceId: null,
    syncVersion: 1,
  });
  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error?.issues), /Duplicate extinguisher id/);
});
