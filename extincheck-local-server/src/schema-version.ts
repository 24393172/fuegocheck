import { DatabaseSync } from 'node:sqlite';

export const CURRENT_SCHEMA_VERSION = 3;

export function configureSqlite(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;');
}

export function readSchemaVersion(database: DatabaseSync): number {
  return Number((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
}

export function requireSupportedSchema(database: DatabaseSync): number {
  const version = readSchemaVersion(database);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `La base usa el esquema ${version}, más reciente que el soportado (${CURRENT_SCHEMA_VERSION}).`
    );
  }
  return version;
}

export function setSchemaVersion(database: DatabaseSync, version: number): void {
  database.exec(`PRAGMA user_version = ${version}`);
}

export function applyOrderedMigrations(
  database: DatabaseSync,
  migrations: ReadonlyArray<{ version: number; name: string; up: () => void }>
): void {
  let current = requireSupportedSchema(database);
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    if (migration.version !== current + 1) {
      throw new Error(`Falta la migración ordenada posterior al esquema ${current}.`);
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      migration.up();
      setSchemaVersion(database, migration.version);
      database.exec('COMMIT');
      current = migration.version;
    } catch (error) {
      database.exec('ROLLBACK');
      throw new Error(`Falló la migración ${migration.version} (${migration.name}).`, { cause: error });
    }
  }
}
