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

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      form_type TEXT NOT NULL,
      form_version INTEGER NOT NULL,
      technician_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
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
  `);

  // Migrate any legacy 'pending_sync' records to 'completed' — the sync queue
  // no longer exists; sharing is now done manually via the mail composer.
  await database.runAsync(
    `UPDATE inspections SET status = 'completed' WHERE status = 'pending_sync'`
  );
}
