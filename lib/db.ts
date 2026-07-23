import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('fuego_seguridad.db');
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = getDatabase();

  // WAL speeds up the frequent autosave writes; foreign_keys is OFF by default
  // in SQLite, so the REFERENCES below would be decorative without this.
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      form_type TEXT NOT NULL,
      form_version INTEGER NOT NULL,
      technician_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      pending_comment TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      form_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      last_sync_attempt INTEGER,
      synced_at INTEGER,
      sync_error TEXT,
      synced_format_ids TEXT NOT NULL DEFAULT '[]',
      official_report_id TEXT,
      official_report_filename TEXT,
      official_report_download_url TEXT
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL REFERENCES inspections(id),
      field_key TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      thumbnail_uri TEXT,
      caption TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      format_type TEXT NOT NULL DEFAULT 'legacy',
      form_type TEXT,
      item_id TEXT,
      location_name_snapshot TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      synced_at INTEGER,
      last_sync_attempt INTEGER,
      sync_error TEXT,
      server_evidence_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      legacy INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL REFERENCES inspections(id),
      signer_type TEXT NOT NULL,
      image_base64 TEXT NOT NULL,
      signed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      area TEXT NOT NULL DEFAULT '',
      attention TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_name TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      server_updated_at TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_branches (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES catalog_companies(id),
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      server_updated_at TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_locations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES catalog_companies(id),
      branch_id TEXT REFERENCES catalog_branches(id),
      equipment_type TEXT NOT NULL CHECK (equipment_type IN (
        'extinguisher', 'hydrant', 'addressed_device', 'conventional_device', 'notification_device'
      )),
      name TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      floor TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      server_updated_at TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_types (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY, template_type_id TEXT NOT NULL REFERENCES template_types(id),
      name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS template_locations (
      id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES templates(id),
      location TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS template_versions (
      id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES templates(id),
      version INTEGER NOT NULL, schema_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE(template_id, version)
    );
    CREATE TABLE IF NOT EXISTS template_fields (
      id TEXT PRIMARY KEY, template_version_id TEXT NOT NULL REFERENCES template_versions(id),
      field_key TEXT NOT NULL, section_id TEXT NOT NULL, definition_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_photos_inspection ON photos(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_signatures_inspection ON signatures(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_inspections_created ON inspections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_catalog_branches_company
      ON catalog_branches(company_id, active, name);
    CREATE INDEX IF NOT EXISTS idx_catalog_locations_company_type
      ON catalog_locations(company_id, equipment_type, active, name);
    CREATE INDEX IF NOT EXISTS idx_catalog_locations_branch_type
      ON catalog_locations(branch_id, equipment_type, active, name);
  `);

  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((versionRow?.user_version ?? 0) < 9) {
    const locationSql = await database.getFirstAsync<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'catalog_locations'`
    );
    if (locationSql?.sql && !locationSql.sql.includes('addressed_device')) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(`
          CREATE TABLE catalog_locations_v9 (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL REFERENCES catalog_companies(id),
            branch_id TEXT REFERENCES catalog_branches(id),
            equipment_type TEXT NOT NULL CHECK (equipment_type IN (
              'extinguisher', 'hydrant', 'addressed_device', 'conventional_device', 'notification_device'
            )),
            name TEXT NOT NULL,
            area TEXT NOT NULL DEFAULT '',
            floor TEXT NOT NULL DEFAULT '',
            reference TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            server_updated_at TEXT NOT NULL,
            synced_at INTEGER NOT NULL
          );
          INSERT INTO catalog_locations_v9
            SELECT id, company_id, branch_id, equipment_type, name, area, floor, reference,
                   active, server_updated_at, synced_at
            FROM catalog_locations;
          DROP TABLE catalog_locations;
          ALTER TABLE catalog_locations_v9 RENAME TO catalog_locations;
          CREATE INDEX idx_catalog_locations_company_type
            ON catalog_locations(company_id, equipment_type, active, name);
          CREATE INDEX idx_catalog_locations_branch_type
            ON catalog_locations(branch_id, equipment_type, active, name);
        `);
      });
    }
  }

  const inspectionColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(inspections)');
  const photoColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(photos)');
  const photoColumnNames = new Set(photoColumns.map((column) => column.name));
  const hadEvidenceModel = photoColumnNames.has('format_type');
  for (const [column, definition] of [
    ['updated_at', 'INTEGER NOT NULL DEFAULT 0'], ['format_type', "TEXT NOT NULL DEFAULT 'legacy'"],
    ['form_type', 'TEXT'], ['item_id', 'TEXT'], ['location_name_snapshot', 'TEXT'],
    ['sync_status', "TEXT NOT NULL DEFAULT 'pending'"], ['synced_at', 'INTEGER'],
    ['last_sync_attempt', 'INTEGER'], ['sync_error', 'TEXT'], ['server_evidence_id', 'TEXT'],
    ['is_deleted', 'INTEGER NOT NULL DEFAULT 0'], ['legacy', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    if (!photoColumnNames.has(column)) await database.execAsync(`ALTER TABLE photos ADD COLUMN ${column} ${definition};`);
  }
  if (!hadEvidenceModel) {
    await database.execAsync(`UPDATE photos SET
      updated_at = created_at,
      format_type = CASE WHEN instr(field_key, ':') > 0 THEN substr(field_key, 1, instr(field_key, ':') - 1) ELSE 'legacy' END,
      item_id = NULL,
      location_name_snapshot = NULL,
      sync_status = 'pending',
      legacy = 1;`);
  }
  await database.execAsync(`UPDATE photos SET
    form_type = CASE
      WHEN format_type = 'jockey' THEN 'pump_jockey'
      WHEN format_type = 'electrica' THEN 'pump_electric'
      WHEN format_type = 'diesel' THEN 'pump_diesel'
      ELSE form_type
    END,
    format_type = CASE
      WHEN format_type IN ('jockey', 'electrica', 'diesel') THEN 'fire_pumps'
      ELSE format_type
    END
    WHERE format_type IN ('jockey', 'electrica', 'diesel');`);
  if (!inspectionColumns.some((column) => column.name === 'pending_comment')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN pending_comment TEXT;');
  }
  if (!inspectionColumns.some((column) => column.name === 'pinned')) {
    await database.execAsync(
      'ALTER TABLE inspections ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;'
    );
  }
  if (!inspectionColumns.some((column) => column.name === 'sync_status')) {
    await database.execAsync("ALTER TABLE inspections ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';");
  }
  if (!inspectionColumns.some((column) => column.name === 'last_sync_attempt')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN last_sync_attempt INTEGER;');
  }
  if (!inspectionColumns.some((column) => column.name === 'synced_at')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN synced_at INTEGER;');
  }
  if (!inspectionColumns.some((column) => column.name === 'sync_error')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN sync_error TEXT;');
  }
  if (!inspectionColumns.some((column) => column.name === 'synced_format_ids')) {
    await database.execAsync("ALTER TABLE inspections ADD COLUMN synced_format_ids TEXT NOT NULL DEFAULT '[]';");
  }
  if (!inspectionColumns.some((column) => column.name === 'official_report_id')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN official_report_id TEXT;');
  }
  if (!inspectionColumns.some((column) => column.name === 'official_report_filename')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN official_report_filename TEXT;');
  }
  if (!inspectionColumns.some((column) => column.name === 'official_report_download_url')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN official_report_download_url TEXT;');
  }
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_inspections_pinned_updated
    ON inspections(pinned DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_photos_sync
    ON photos(inspection_id, sync_status, is_deleted);
  `);

  const now = Date.now();
  const sampleCompanies = [
    ['company-park-royal-cancun', 'Park Royal Cancun', 'Cuarto de Máquinas', 'Ing. Luis Santos'],
    ['company-hotel-cancun-centro', 'Hotel Cancun Centro', 'Lobby principal', 'Mantenimiento'],
    ['company-plaza-las-americas', 'Plaza Las Américas', 'Área comercial', 'Administración'],
    ['company-hotel-mar-azul', 'Hotel Mar Azul', 'Casa de máquinas', 'Arq. Fernanda Ruiz'],
    ['company-hospital-san-gabriel', 'Hospital San Gabriel', 'Servicios generales', 'Ing. Carlos Méndez'],
    ['company-bodega-caribe', 'Bodega Caribe', 'Nave industrial', 'Jefatura de mantenimiento'],
    ['company-torre-kukulkan', 'Torre Empresarial Kukulkán', 'Sótano técnico', 'Administración del edificio'],
  ] as const;

  for (const [id, name, area, attention] of sampleCompanies) {
    await database.runAsync(
      `INSERT OR IGNORE INTO companies (id, name, area, attention, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, area, attention, now]
    );
  }

  // Migrate any legacy 'pending_sync' records to 'completed' — the sync queue
  // no longer exists; sharing is now done manually via the mail composer.
  await database.runAsync(
    `UPDATE inspections SET status = 'completed' WHERE status = 'pending_sync'`
  );

  await database.execAsync('PRAGMA user_version = 9;');
}
