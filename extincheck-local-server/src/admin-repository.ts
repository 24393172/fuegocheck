import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BranchInput, CompanyInput, EquipmentType, LocationInput } from './admin-validation.js';

type ActiveFilter = boolean | undefined;

export class AdminConflictError extends Error {}
export class AdminNotFoundError extends Error {}
export class AdminValidationError extends Error {}

export class AdminRepository {
  private readonly database: DatabaseSync;

  constructor(public readonly filePath: string) {
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        business_name TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_normalized_name
      ON companies(lower(trim(name)));

      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_company_normalized_name
      ON branches(company_id, lower(trim(name)));

      CREATE TABLE IF NOT EXISTS equipment_locations (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id),
        branch_id TEXT REFERENCES branches(id),
        equipment_type TEXT NOT NULL CHECK (equipment_type IN (
          'extinguisher', 'hydrant', 'addressed_device', 'conventional_device', 'notification_device'
        )),
        name TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT '',
        floor TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_locations_company_type
      ON equipment_locations(company_id, equipment_type, active);

      CREATE INDEX IF NOT EXISTS idx_locations_branch
      ON equipment_locations(branch_id);
    `);
    const locationTable = this.database.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'equipment_locations'`
    ).get() as { sql: string } | undefined;
    if (locationTable?.sql && !locationTable.sql.includes('addressed_device')) {
      this.database.exec('PRAGMA foreign_keys = OFF;');
      try {
        this.database.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE equipment_locations_v2 (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL REFERENCES companies(id),
            branch_id TEXT REFERENCES branches(id),
            equipment_type TEXT NOT NULL CHECK (equipment_type IN (
              'extinguisher', 'hydrant', 'addressed_device', 'conventional_device', 'notification_device'
            )),
            name TEXT NOT NULL,
            area TEXT NOT NULL DEFAULT '',
            floor TEXT NOT NULL DEFAULT '',
            reference TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO equipment_locations_v2 SELECT * FROM equipment_locations;
          DROP TABLE equipment_locations;
          ALTER TABLE equipment_locations_v2 RENAME TO equipment_locations;
          CREATE INDEX idx_locations_company_type
            ON equipment_locations(company_id, equipment_type, active);
          CREATE INDEX idx_locations_branch ON equipment_locations(branch_id);
          COMMIT;
        `);
      } catch (error) {
        try { this.database.exec('ROLLBACK;'); } catch { /* transaction may already be closed */ }
        throw error;
      } finally {
        this.database.exec('PRAGMA foreign_keys = ON;');
      }
    }
  }

  listCompanies(filters: { search?: string; active?: ActiveFilter } = {}) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (filters.search?.trim()) {
      conditions.push('(lower(name) LIKE ? OR lower(business_name) LIKE ?)');
      const search = `%${filters.search.trim().toLocaleLowerCase()}%`;
      values.push(search, search);
    }
    if (filters.active !== undefined) {
      conditions.push('active = ?');
      values.push(filters.active ? 1 : 0);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.database.prepare(`
      SELECT c.id, c.name, c.business_name AS businessName, c.active,
             c.created_at AS createdAt, c.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id AND b.active = 1) AS activeBranches,
             (SELECT COUNT(*) FROM equipment_locations l WHERE l.company_id = c.id AND l.active = 1) AS activeLocations
      FROM companies c ${where}
      ORDER BY c.active DESC, lower(c.name)
    `).all(...values).map(booleanFields);
  }

  getCompany(id: string) {
    const row = this.database.prepare(`
      SELECT id, name, business_name AS businessName, active,
             created_at AS createdAt, updated_at AS updatedAt
      FROM companies WHERE id = ?
    `).get(id);
    return row ? booleanFields(row) : undefined;
  }

  createCompany(input: CompanyInput) {
    const name = cleanName(input.name);
    const duplicate = this.findCompanyByName(name);
    if (duplicate) return { created: false, company: duplicate };
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      this.database.prepare(`
        INSERT INTO companies (id, name, business_name, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, input.businessName.trim(), input.active ? 1 : 0, now, now);
    } catch (error) {
      throw this.conflict(error, 'Ya existe una empresa con ese nombre.');
    }
    return { created: true, company: this.getCompany(id)! };
  }

  updateCompany(id: string, input: CompanyInput) {
    this.requireCompany(id);
    const name = cleanName(input.name);
    const duplicate = this.findCompanyByName(name);
    if (duplicate && duplicate.id !== id) throw new AdminConflictError('Ya existe una empresa con ese nombre.');
    try {
      this.database.prepare(`
        UPDATE companies SET name = ?, business_name = ?, active = ?, updated_at = ? WHERE id = ?
      `).run(name, input.businessName.trim(), input.active ? 1 : 0, new Date().toISOString(), id);
    } catch (error) {
      throw this.conflict(error, 'Ya existe una empresa con ese nombre.');
    }
    return this.getCompany(id)!;
  }

  setCompanyStatus(id: string, active: boolean) {
    this.requireCompany(id);
    this.database.prepare('UPDATE companies SET active = ?, updated_at = ? WHERE id = ?')
      .run(active ? 1 : 0, new Date().toISOString(), id);
    return this.getCompany(id)!;
  }

  listBranches(companyId: string, active?: ActiveFilter) {
    this.requireCompany(companyId);
    const where = active === undefined ? '' : 'AND active = ?';
    const values = active === undefined ? [companyId] : [companyId, active ? 1 : 0];
    return this.database.prepare(`
      SELECT id, company_id AS companyId, name, address, active,
             created_at AS createdAt, updated_at AS updatedAt
      FROM branches WHERE company_id = ? ${where}
      ORDER BY active DESC, lower(name)
    `).all(...values).map(booleanFields);
  }

  createBranch(companyId: string, input: BranchInput) {
    this.requireCompany(companyId);
    const name = cleanName(input.name);
    const duplicate = this.findBranchByName(companyId, name);
    if (duplicate) return { created: false, branch: duplicate };
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      this.database.prepare(`
        INSERT INTO branches (id, company_id, name, address, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, companyId, name, input.address.trim(), input.active ? 1 : 0, now, now);
    } catch (error) {
      throw this.conflict(error, 'Ya existe una sucursal con ese nombre en la empresa.');
    }
    return { created: true, branch: this.getBranch(id)! };
  }

  updateBranch(id: string, input: BranchInput) {
    const current = this.requireBranch(id);
    const name = cleanName(input.name);
    const duplicate = this.findBranchByName(current.companyId, name);
    if (duplicate && duplicate.id !== id) throw new AdminConflictError('Ya existe una sucursal con ese nombre en la empresa.');
    this.database.prepare(`
      UPDATE branches SET name = ?, address = ?, active = ?, updated_at = ? WHERE id = ?
      `).run(name, input.address.trim(), input.active ? 1 : 0, new Date().toISOString(), id);
    return this.getBranch(id)!;
  }

  setBranchStatus(id: string, active: boolean) {
    this.requireBranch(id);
    this.database.prepare('UPDATE branches SET active = ?, updated_at = ? WHERE id = ?')
      .run(active ? 1 : 0, new Date().toISOString(), id);
    return this.getBranch(id)!;
  }

  listLocations(companyId: string, filters: {
    equipmentType?: EquipmentType;
    branchId?: string | null;
    active?: ActiveFilter;
    search?: string;
  } = {}) {
    this.requireCompany(companyId);
    const conditions = ['l.company_id = ?'];
    const values: Array<string | number | null> = [companyId];
    if (filters.equipmentType) {
      conditions.push('l.equipment_type = ?');
      values.push(filters.equipmentType);
    }
    if (filters.branchId !== undefined) {
      conditions.push(filters.branchId === null ? 'l.branch_id IS NULL' : 'l.branch_id = ?');
      if (filters.branchId !== null) values.push(filters.branchId);
    }
    if (filters.active !== undefined) {
      conditions.push('l.active = ?');
      values.push(filters.active ? 1 : 0);
    }
    if (filters.search?.trim()) {
      conditions.push(`lower(l.name || ' ' || l.area || ' ' || l.floor || ' ' || l.reference) LIKE ?`);
      values.push(`%${filters.search.trim().toLocaleLowerCase()}%`);
    }
    return this.database.prepare(`
      SELECT l.id, l.company_id AS companyId, l.branch_id AS branchId,
             l.equipment_type AS equipmentType, l.name, l.area, l.floor,
             l.reference, l.active, l.created_at AS createdAt, l.updated_at AS updatedAt,
             b.name AS branchName
      FROM equipment_locations l
      LEFT JOIN branches b ON b.id = l.branch_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.active DESC, lower(l.name)
    `).all(...values).map(booleanFields);
  }

  createLocation(companyId: string, input: LocationInput) {
    this.requireCompany(companyId);
    this.validateBranchForCompany(input.branchId, companyId);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO equipment_locations (
        id, company_id, branch_id, equipment_type, name, area, floor,
        reference, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, companyId, input.branchId, input.equipmentType, input.name.trim(), input.area.trim(),
      input.floor.trim(), input.reference.trim(), input.active ? 1 : 0, now, now
    );
    return this.getLocation(id)!;
  }

  updateLocation(id: string, input: LocationInput) {
    const current = this.requireLocation(id);
    this.validateBranchForCompany(input.branchId, current.companyId);
    this.database.prepare(`
      UPDATE equipment_locations SET branch_id = ?, equipment_type = ?, name = ?,
        area = ?, floor = ?, reference = ?, active = ?, updated_at = ? WHERE id = ?
    `).run(
      input.branchId, input.equipmentType, input.name.trim(), input.area.trim(), input.floor.trim(),
      input.reference.trim(), input.active ? 1 : 0, new Date().toISOString(), id
    );
    return this.getLocation(id)!;
  }

  setLocationStatus(id: string, active: boolean) {
    this.requireLocation(id);
    this.database.prepare('UPDATE equipment_locations SET active = ?, updated_at = ? WHERE id = ?')
      .run(active ? 1 : 0, new Date().toISOString(), id);
    return this.getLocation(id)!;
  }

  mobileCatalog() {
    const companies = this.listCompanies({ active: true }).map((company) => {
      const branches = this.listBranches(company.id, true);
      const activeBranchIds = new Set(branches.map((branch) => branch.id));
      return {
        id: company.id,
        name: company.name,
        businessName: company.businessName,
        branches: branches.map(compactBranch),
        locations: this.listLocations(company.id, { active: true })
          .filter((location) => location.branchId === null || activeBranchIds.has(location.branchId))
          .map(compactLocation),
      };
    });
    const versionRow = this.database.prepare(`
      SELECT MAX(updated_at) AS version FROM (
        SELECT updated_at FROM companies UNION ALL
        SELECT updated_at FROM branches UNION ALL
        SELECT updated_at FROM equipment_locations
      )
    `).get() as { version: string | null };
    return {
      version: versionRow.version ?? 'empty',
      generatedAt: new Date().toISOString(),
      companies,
    };
  }

  seedExampleData() {
    const companyResult = this.createCompany({ name: 'Bodega Caribe', businessName: '', active: true });
    const companyId = companyResult.company.id;
    const examples: Array<[EquipmentType, string]> = [
      ['extinguisher', 'Recepción'],
      ['extinguisher', 'Almacén principal'],
      ['extinguisher', 'Cuarto eléctrico'],
      ['hydrant', 'Patio norte'],
      ['hydrant', 'Acceso de proveedores'],
      ['addressed_device', 'Pasillo principal'],
      ['conventional_device', 'Cuarto de máquinas'],
      ['notification_device', 'Vestíbulo principal'],
    ];
    const existing = this.listLocations(companyId);
    for (const [equipmentType, name] of examples) {
      if (!existing.some((location) => location.equipmentType === equipmentType && normalize(location.name) === normalize(name))) {
        this.createLocation(companyId, {
          branchId: null, equipmentType, name, area: '', floor: '', reference: '', active: true,
        });
      }
    }
    return { company: this.getCompany(companyId), locations: this.listLocations(companyId) };
  }

  close() {
    this.database.close();
  }

  private getBranch(id: string): any | undefined {
    const row = this.database.prepare(`
      SELECT id, company_id AS companyId, name, address, active,
             created_at AS createdAt, updated_at AS updatedAt
      FROM branches WHERE id = ?
    `).get(id);
    return row ? booleanFields(row) : undefined;
  }

  private getLocation(id: string): any | undefined {
    const row = this.database.prepare(`
      SELECT l.id, l.company_id AS companyId, l.branch_id AS branchId,
             l.equipment_type AS equipmentType, l.name, l.area, l.floor,
             l.reference, l.active, l.created_at AS createdAt, l.updated_at AS updatedAt,
             b.name AS branchName
      FROM equipment_locations l LEFT JOIN branches b ON b.id = l.branch_id WHERE l.id = ?
    `).get(id);
    return row ? booleanFields(row) : undefined;
  }

  private findCompanyByName(name: string): any | undefined {
    const row = this.database.prepare(`
      SELECT id, name, business_name AS businessName, active,
             created_at AS createdAt, updated_at AS updatedAt
      FROM companies WHERE lower(trim(name)) = lower(trim(?))
    `).get(name);
    return row ? booleanFields(row) : undefined;
  }

  private findBranchByName(companyId: string, name: string): any | undefined {
    const row = this.database.prepare(`
      SELECT id, company_id AS companyId, name, address, active,
             created_at AS createdAt, updated_at AS updatedAt
      FROM branches WHERE company_id = ? AND lower(trim(name)) = lower(trim(?))
    `).get(companyId, name);
    return row ? booleanFields(row) : undefined;
  }

  private requireCompany(id: string): any {
    const company = this.getCompany(id);
    if (!company) throw new AdminNotFoundError('Empresa no encontrada.');
    return company;
  }

  private requireBranch(id: string): any {
    const branch = this.getBranch(id);
    if (!branch) throw new AdminNotFoundError('Sucursal no encontrada.');
    return branch;
  }

  private requireLocation(id: string): any {
    const location = this.getLocation(id);
    if (!location) throw new AdminNotFoundError('Ubicación no encontrada.');
    return location;
  }

  private validateBranchForCompany(branchId: string | null, companyId: string) {
    if (!branchId) return;
    const branch = this.requireBranch(branchId);
    if (branch.companyId !== companyId) {
      throw new AdminValidationError('La sucursal no pertenece a la empresa seleccionada.');
    }
  }

  private conflict(error: unknown, message: string): Error {
    return error instanceof Error && /unique/i.test(error.message) ? new AdminConflictError(message) : error as Error;
  }
}

function booleanFields(row: any) {
  return { ...row, active: Boolean(row.active) };
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalize(value: string) {
  return cleanName(value).toLocaleLowerCase();
}

function compactBranch(branch: any) {
  return { id: branch.id, name: branch.name, address: branch.address };
}

function compactLocation(location: any) {
  return {
    id: location.id,
    equipmentType: location.equipmentType,
    name: location.name,
    branchId: location.branchId,
    area: location.area,
    floor: location.floor,
    reference: location.reference,
  };
}
