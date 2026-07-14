import { z } from 'zod';
import { getDatabase } from '../lib/db';
import { checkServerHealth, getLocalServerUrl, requestLocalServer } from './local-server-api';
import {
  CatalogBranch,
  CatalogCompany,
  CatalogEquipmentType,
  CatalogLocation,
  CatalogStatus,
} from '../types/catalog.types';

const shortText = z.string().trim().max(300);
const locationSchema = z.object({
  id: z.uuid(),
  equipmentType: z.enum(['extinguisher', 'hydrant']),
  name: z.string().trim().min(1).max(160),
  branchId: z.uuid().nullable(),
  area: shortText.default(''),
  floor: shortText.default(''),
  reference: z.string().trim().max(500).default(''),
}).strict();
const branchSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(500).default(''),
}).strict();
const companySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(160),
  businessName: z.string().trim().max(240).default(''),
  branches: z.array(branchSchema).max(500),
  locations: z.array(locationSchema).max(10000),
}).strict();
const catalogSchema = z.object({
  version: z.string().min(1).max(100),
  generatedAt: z.iso.datetime(),
  companies: z.array(companySchema).max(2000),
}).strict();

export type ServerCatalog = z.infer<typeof catalogSchema>;

export async function fetchCatalog(): Promise<ServerCatalog> {
  const response = await requestLocalServer<unknown>('/api/mobile/catalog');
  const parsed = catalogSchema.parse(response);
  validateCatalogRelations(parsed);
  return parsed;
}

export async function syncCatalog(): Promise<CatalogStatus> {
  await checkServerHealth();
  const catalog = await fetchCatalog();
  const database = getDatabase();
  const syncedAt = Date.now();
  const serverUrl = getLocalServerUrl();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('UPDATE catalog_locations SET active = 0 WHERE active = 1');
    await transaction.runAsync('UPDATE catalog_branches SET active = 0 WHERE active = 1');
    await transaction.runAsync('UPDATE catalog_companies SET active = 0 WHERE active = 1');

    for (const company of catalog.companies) {
      await transaction.runAsync(
        `INSERT INTO catalog_companies
          (id, name, business_name, active, server_updated_at, synced_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           business_name = excluded.business_name,
           active = 1,
           server_updated_at = excluded.server_updated_at,
           synced_at = excluded.synced_at`,
        [company.id, company.name, company.businessName, catalog.generatedAt, syncedAt]
      );
      for (const branch of company.branches) {
        await transaction.runAsync(
          `INSERT INTO catalog_branches
            (id, company_id, name, address, active, server_updated_at, synced_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             company_id = excluded.company_id,
             name = excluded.name,
             address = excluded.address,
             active = 1,
             server_updated_at = excluded.server_updated_at,
             synced_at = excluded.synced_at`,
          [branch.id, company.id, branch.name, branch.address, catalog.generatedAt, syncedAt]
        );
      }
      for (const location of company.locations) {
        await transaction.runAsync(
          `INSERT INTO catalog_locations
            (id, company_id, branch_id, equipment_type, name, area, floor, reference,
             active, server_updated_at, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             company_id = excluded.company_id,
             branch_id = excluded.branch_id,
             equipment_type = excluded.equipment_type,
             name = excluded.name,
             area = excluded.area,
             floor = excluded.floor,
             reference = excluded.reference,
             active = 1,
             server_updated_at = excluded.server_updated_at,
             synced_at = excluded.synced_at`,
          [
            location.id, company.id, location.branchId, location.equipmentType,
            location.name, location.area, location.floor, location.reference,
            catalog.generatedAt, syncedAt,
          ]
        );
      }
    }

    const metadata: Array<[string, string]> = [
      ['catalog_version', catalog.version],
      ['last_catalog_sync', String(syncedAt)],
      ['server_url_used', serverUrl],
    ];
    for (const [key, value] of metadata) {
      await transaction.runAsync(
        `INSERT INTO catalog_metadata (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
      );
    }
  });

  return getCatalogStatus();
}

export function getCompanies(): Promise<CatalogCompany[]> {
  return getDatabase().getAllAsync<CatalogCompany>(
    `SELECT id, name, business_name AS businessName, active = 1 AS active,
            server_updated_at AS serverUpdatedAt, synced_at AS syncedAt
     FROM catalog_companies WHERE active = 1 ORDER BY name COLLATE NOCASE`,
    []
  );
}

export function getBranchesByCompany(companyId: string): Promise<CatalogBranch[]> {
  return getDatabase().getAllAsync<CatalogBranch>(
    `SELECT id, company_id AS companyId, name, address, active = 1 AS active,
            server_updated_at AS serverUpdatedAt, synced_at AS syncedAt
     FROM catalog_branches
     WHERE company_id = ? AND active = 1 ORDER BY name COLLATE NOCASE`,
    [companyId]
  );
}

export function getLocationsByCompany(
  companyId: string,
  equipmentType: CatalogEquipmentType
): Promise<CatalogLocation[]> {
  return getDatabase().getAllAsync<CatalogLocation>(
    `SELECT id, company_id AS companyId, branch_id AS branchId,
            equipment_type AS equipmentType, name, area, floor, reference,
            active = 1 AS active, server_updated_at AS serverUpdatedAt, synced_at AS syncedAt
     FROM catalog_locations
     WHERE company_id = ? AND equipment_type = ? AND active = 1
     ORDER BY name COLLATE NOCASE`,
    [companyId, equipmentType]
  );
}

export function getLocationsByBranch(
  branchId: string,
  equipmentType: CatalogEquipmentType
): Promise<CatalogLocation[]> {
  return getDatabase().getAllAsync<CatalogLocation>(
    `SELECT id, company_id AS companyId, branch_id AS branchId,
            equipment_type AS equipmentType, name, area, floor, reference,
            active = 1 AS active, server_updated_at AS serverUpdatedAt, synced_at AS syncedAt
     FROM catalog_locations
     WHERE branch_id = ? AND equipment_type = ? AND active = 1
     ORDER BY name COLLATE NOCASE`,
    [branchId, equipmentType]
  );
}

export async function getLastCatalogSync(): Promise<number | null> {
  const row = await getDatabase().getFirstAsync<{ value: string }>(
    `SELECT value FROM catalog_metadata WHERE key = 'last_catalog_sync'`
  );
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function getCatalogStatus(): Promise<CatalogStatus> {
  const database = getDatabase();
  const [metadata, counts] = await Promise.all([
    database.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM catalog_metadata
       WHERE key IN ('catalog_version', 'last_catalog_sync', 'server_url_used')`
    ),
    database.getFirstAsync<{
      companies: number;
      extinguisherLocations: number;
      hydrantLocations: number;
    }>(`SELECT
      (SELECT COUNT(*) FROM catalog_companies WHERE active = 1) AS companies,
      (SELECT COUNT(*) FROM catalog_locations WHERE active = 1 AND equipment_type = 'extinguisher') AS extinguisherLocations,
      (SELECT COUNT(*) FROM catalog_locations WHERE active = 1 AND equipment_type = 'hydrant') AS hydrantLocations`),
  ]);
  const values = Object.fromEntries(metadata.map((row) => [row.key, row.value]));
  const lastSync = Number(values.last_catalog_sync);
  return {
    version: values.catalog_version ?? null,
    lastSync: Number.isFinite(lastSync) && lastSync > 0 ? lastSync : null,
    serverUrl: values.server_url_used || safeServerUrl(),
    companies: counts?.companies ?? 0,
    extinguisherLocations: counts?.extinguisherLocations ?? 0,
    hydrantLocations: counts?.hydrantLocations ?? 0,
  };
}

function validateCatalogRelations(catalog: ServerCatalog) {
  const companyIds = new Set<string>();
  const entityIds = new Set<string>();
  for (const company of catalog.companies) {
    if (companyIds.has(company.id)) throw new Error('El catálogo contiene empresas duplicadas.');
    companyIds.add(company.id);
    const branchIds = new Set<string>();
    for (const branch of company.branches) {
      if (entityIds.has(branch.id)) throw new Error('El catálogo contiene sucursales duplicadas.');
      entityIds.add(branch.id);
      branchIds.add(branch.id);
    }
    for (const location of company.locations) {
      if (entityIds.has(location.id)) throw new Error('El catálogo contiene ubicaciones duplicadas.');
      entityIds.add(location.id);
      if (location.branchId && !branchIds.has(location.branchId)) {
        throw new Error('Una ubicación referencia una sucursal inválida.');
      }
    }
  }
}

function safeServerUrl() {
  try {
    return getLocalServerUrl();
  } catch {
    return 'No configurado';
  }
}
