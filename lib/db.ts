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
      form_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL REFERENCES inspections(id),
      field_key TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      thumbnail_uri TEXT,
      caption TEXT,
      created_at INTEGER NOT NULL
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
  `);

  const inspectionColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(inspections)');
  if (!inspectionColumns.some((column) => column.name === 'pending_comment')) {
    await database.execAsync('ALTER TABLE inspections ADD COLUMN pending_comment TEXT;');
  }

  const now = Date.now();
  await database.runAsync(
    `INSERT OR IGNORE INTO companies (id, name, area, attention, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['company-park-royal-cancun', 'Park Royal Cancun', 'Cuarto de Maquinas', 'Ing. Luis Santos', now]
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO companies (id, name, area, attention, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['company-hotel-cancun-centro', 'Hotel Cancun Centro', 'Lobby principal', 'Mantenimiento', now]
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO companies (id, name, area, attention, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['company-plaza-las-americas', 'Plaza Las Americas', 'Area comercial', 'Administracion', now]
  );

  // Migrate any legacy 'pending_sync' records to 'completed' — the sync queue
  // no longer exists; sharing is now done manually via the mail composer.
  await database.runAsync(
    `UPDATE inspections SET status = 'completed' WHERE status = 'pending_sync'`
  );

  await database.execAsync('PRAGMA user_version = 2;');
}
