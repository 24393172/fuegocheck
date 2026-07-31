import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AdminRepository } from '../src/admin-repository.js';
import { LocalDatabase } from '../src/database.js';
import { StructuredLogger } from '../src/logger.js';
import { MaintenanceCoordinator } from '../src/maintenance.js';
import { assertServerStopped, ServerInstanceLock } from '../src/instance-lock.js';
import { OperationalService } from '../src/operations.js';
import {
  createStorageLayout,
  resolveStoredPath,
  toPortableStoredPath,
  validateStorageLayout,
} from '../src/storage-paths.js';

test('portable stored paths round-trip on Windows and reject traversal', () => {
  const layout = createStorageLayout({ root: 'C:\\ExtinCheck\\extincheck-local-server' });
  const absolute = 'C:\\ExtinCheck\\extincheck-local-server\\data\\evidence\\one.jpg';
  assert.equal(toPortableStoredPath(absolute, layout), 'data/evidence/one.jpg');
  assert.equal(resolveStoredPath('data/evidence/one.jpg', layout), path.resolve(absolute));
  assert.throws(() => resolveStoredPath('../../Windows/System32/file.txt', layout));
  assert.throws(() => toPortableStoredPath('D:\\external\\file.txt', layout));
});

test('backup configuration rejects nested source and temporary destinations', () => {
  const root = path.join(os.tmpdir(), 'extincheck-config');
  assert.throws(() => validateStorageLayout(createStorageLayout({
    root,
    backups: path.join(root, 'data', 'backups'),
  })));
  assert.throws(() => validateStorageLayout(createStorageLayout({
    root,
    backups: path.join(root, 'temp', 'backups'),
  })));
});

test('schema rejects a database created by a newer server version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-newer-schema-'));
  try {
    const filePath = path.join(root, 'data', 'database.sqlite');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const raw = new DatabaseSync(filePath);
    raw.exec('PRAGMA user_version = 999');
    raw.close();
    assert.throws(() => new LocalDatabase(filePath), /más reciente/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('server instance lock blocks a live restore and is removable without touching data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-lock-'));
  const lock = new ServerInstanceLock(root);
  try {
    lock.acquire();
    assert.throws(() => assertServerStopped(root), /Detén el servidor/);
    lock.release();
    assert.doesNotThrow(() => assertServerStopped(root));
  } finally {
    lock.release();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('structured logs redact secrets and retention removes only expired JSONL logs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-logs-'));
  try {
    const logger = new StructuredLogger(root, 'debug', 1);
    logger.log('info', 'test.event', { requestId: 'request-1', password: 'never-write-this' });
    const current = path.join(root, fs.readdirSync(root).find((name) => name.endsWith('.jsonl'))!);
    const contents = fs.readFileSync(current, 'utf8');
    assert.match(contents, /request-1/);
    assert.doesNotMatch(contents, /never-write-this/);
    const expired = path.join(root, 'extincheck-2000-01-01.jsonl');
    fs.writeFileSync(expired, '{}\n');
    fs.utimesSync(expired, new Date(0), new Date(0));
    assert.equal(logger.cleanup(), 1);
    assert.ok(fs.existsSync(current));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('database migrates known absolute paths and records unknown paths without data loss', () => {
  const fixture = createFixture();
  const known = path.join(fixture.layout.reports, 'known.xlsx');
  const unknown = path.join(path.parse(fixture.layout.root).root, 'outside-extincheck', 'unknown.xlsx');
  fs.writeFileSync(known, 'report');
  fixture.database.close();
  fixture.admin.close();
  const raw = new DatabaseSync(path.join(fixture.layout.data, 'extincheck-local.sqlite'));
  const insertInspection = raw.prepare(`INSERT INTO inspections
    (id, company_name, inspection_date, technician_name, received_at, updated_at, sync_version)
    VALUES (?, 'Empresa', '2026-07-23', 'Técnico', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z', 1)`);
  insertInspection.run('known');
  insertInspection.run('unknown');
  const insertReport = raw.prepare(`INSERT INTO generated_reports
    (id, inspection_id, format_type, filename, file_path, generated_at, status, template_version)
    VALUES (?, ?, 'inspection', ?, ?, '2026-07-23T00:00:00Z', 'generated', 'test')`);
  insertReport.run('report-known', 'known', 'known.xlsx', known);
  insertReport.run('report-unknown', 'unknown', 'unknown.xlsx', unknown);
  raw.close();

  const reopened = new LocalDatabase(path.join(fixture.layout.data, 'extincheck-local.sqlite'), fixture.layout);
  reopened.close();
  const verify = new DatabaseSync(path.join(fixture.layout.data, 'extincheck-local.sqlite'), { readOnly: true });
  const knownRow = verify.prepare('SELECT file_path FROM generated_reports WHERE id = ?').get('report-known') as { file_path: string };
  const unknownRow = verify.prepare('SELECT file_path FROM generated_reports WHERE id = ?').get('report-unknown') as { file_path: string };
  const anomaly = verify.prepare('SELECT COUNT(*) AS count FROM storage_path_anomalies WHERE row_id = ?').get('report-unknown') as { count: number };
  verify.close();
  assert.equal(knownRow.file_path, 'generated-reports/known.xlsx');
  assert.equal(unknownRow.file_path, unknown);
  assert.equal(anomaly.count, 1);
  fixture.removeOnly();
});

test('backup is consistent, portable, excludes sessions and detects tampering', async () => {
  const fixture = createFixture();
  try {
    fixture.admin.createAdminSession({
      id: 'session-1',
      sessionTokenHash: 'a'.repeat(64),
      username: 'admin',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
    const backup = await fixture.service.createBackup({ label: 'pilot' });
    const root = path.join(fixture.layout.backups, backup.id);
    assert.ok(fs.existsSync(path.join(root, 'manifest.json')));
    assert.equal(backup.schemaVersion, 3);
    assert.equal(backup.backupVersion, 1);
    assert.equal(backup.status, 'valid');
    assert.equal(backup.databaseIntegrity.integrityCheck, 'ok');
    assert.ok(backup.templateHash);
    assert.equal(backup.totalFiles, backup.files.length);
    assert.ok(backup.totalSizeBytes > 0);
    assert.ok(backup.files.every((item) => !path.isAbsolute(item.relativePath)));
    assert.ok(backup.files.every((item) => !item.relativePath.toLowerCase().includes('.env')));
    assert.equal(fixture.service.verifyBackup(root).valid, true);

    const copiedDatabase = new (await import('node:sqlite')).DatabaseSync(
      path.join(root, backup.database.relativePath),
      { readOnly: true }
    );
    const sessions = copiedDatabase.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get() as { count: number };
    copiedDatabase.close();
    assert.equal(sessions.count, 0);

    const template = path.join(root, 'templates', 'official.xlsx');
    fs.appendFileSync(template, 'tampered');
    assert.throws(() => fixture.service.verifyBackup(root), /Hash inválido|no coincide/);
  } finally {
    fixture.close();
  }
});

test('backup refuses insufficient disk space before creating a pending directory', async () => {
  const fixture = createFixture();
  try {
    fixture.service.config.minFreeDiskMb = 1_000_000_000;
    await assert.rejects(() => fixture.service.createBackup(), /Espacio insuficiente/);
    assert.deepEqual(fs.readdirSync(fixture.layout.backups), []);
  } finally {
    fixture.close();
  }
});

test('two simultaneous backup requests are not both accepted', async () => {
  const fixture = createFixture();
  try {
    const results = await Promise.allSettled([
      fixture.service.createBackup({ label: 'concurrent-a' }),
      fixture.service.createBackup({ label: 'concurrent-b' }),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  } finally {
    fixture.close();
  }
});

test('storage cleanup is dry-run by default and only removes audited internals', async () => {
  const fixture = createFixture({ tempAgeHours: 1 });
  try {
    const validBackup = await fixture.service.createBackup({ label: 'must-survive-cleanup' });
    const pending = path.join(fixture.layout.backups, 'orphan.pending');
    const oldTemp = path.join(fixture.layout.temp, 'old.tmp');
    const report = path.join(fixture.layout.reports, 'keep.xlsx');
    fs.mkdirSync(pending, { recursive: true });
    fs.mkdirSync(fixture.layout.temp, { recursive: true });
    fs.writeFileSync(oldTemp, 'old');
    fs.utimesSync(oldTemp, new Date(0), new Date(0));
    fs.mkdirSync(fixture.layout.reports, { recursive: true });
    fs.writeFileSync(report, 'keep');

    const dryRun = await fixture.service.cleanup() as { dryRun: boolean };
    assert.equal(dryRun.dryRun, true);
    assert.ok(fs.existsSync(pending));
    await assert.rejects(() => fixture.service.cleanup(true, 'WRONG'));
    const applied = await fixture.service.cleanup(true, 'CLEANUP') as { removed: number };
    assert.ok(applied.removed >= 2);
    assert.ok(!fs.existsSync(pending));
    assert.ok(!fs.existsSync(oldTemp));
    assert.ok(fs.existsSync(report));
    assert.ok(fs.existsSync(path.join(fixture.layout.backups, validBackup.id)));
  } finally {
    fixture.close();
  }
});

test('storage audit detects orphan files, missing rows and legacy absolute paths without deleting', () => {
  const fixture = createFixture();
  try {
    const orphan = path.join(fixture.layout.reports, 'orphan.xlsx');
    fs.writeFileSync(orphan, 'orphan');
    const raw = new DatabaseSync(path.join(fixture.layout.data, 'extincheck-local.sqlite'));
    raw.prepare(`INSERT INTO inspections
      (id, company_name, inspection_date, technician_name, received_at, updated_at, sync_version)
      VALUES ('audit-inspection', 'Empresa', '2026-07-23', 'Técnico', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z', 1)`).run();
    raw.prepare(`INSERT INTO generated_reports
      (id, inspection_id, format_type, filename, file_path, generated_at, status, template_version)
      VALUES ('audit-report', 'audit-inspection', 'inspection', 'missing.xlsx',
      'generated-reports/missing.xlsx', '2026-07-23T00:00:00Z', 'generated', 'test')`).run();
    raw.prepare(`INSERT INTO inspections
      (id, company_name, inspection_date, technician_name, received_at, updated_at, sync_version)
      VALUES ('audit-absolute', 'Empresa', '2026-07-23', 'Técnico', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z', 1)`).run();
    raw.prepare(`INSERT INTO generated_reports
      (id, inspection_id, format_type, filename, file_path, generated_at, status, template_version)
      VALUES ('audit-absolute-report', 'audit-absolute', 'inspection', 'outside.xlsx',
      ?, '2026-07-23T00:00:00Z', 'generated', 'test')`).run(
        path.join(path.parse(fixture.layout.root).root, 'outside', 'outside.xlsx')
      );
    raw.close();
    const audit = fixture.service.storageAudit();
    assert.ok(audit.errors.some((item) => item.type === 'registered-file-missing'));
    assert.ok(audit.warnings.some((item) => item.type === 'orphan-physical-file'));
    assert.ok(audit.warnings.some((item) => item.type === 'legacy-absolute-path'));
    assert.ok(fs.existsSync(orphan));
  } finally {
    fixture.close();
  }
});

test('restore dry-run makes no changes and injected failure rolls everything back', async () => {
  const fixture = createFixture();
  const originalTemplate = path.join(fixture.layout.templates, 'official.xlsx');
  try {
    const backup = await fixture.service.createBackup({ label: 'restore-source' });
    const backupRoot = path.join(fixture.layout.backups, backup.id);
    fs.writeFileSync(originalTemplate, 'current-version');
    const dryRun = await fixture.service.restore(backupRoot) as { dryRun: boolean };
    assert.equal(dryRun.dryRun, true);
    assert.equal(fs.readFileSync(originalTemplate, 'utf8'), 'current-version');
    await assert.rejects(
      () => fixture.service.restore(backupRoot, true, backup.id, 'before-swap'),
      /inyectado/
    );
    assert.equal(fs.readFileSync(originalTemplate, 'utf8'), 'current-version');
    await assert.rejects(
      () => fixture.service.restore(backupRoot, true, backup.id, 'after-validation'),
      /inyectado/
    );
    assert.equal(fs.readFileSync(originalTemplate, 'utf8'), 'current-version');
  } finally {
    fixture.removeOnly();
  }
});

test('confirmed restore replaces the staged data, validates SQLite and revokes sessions', async () => {
  const fixture = createFixture();
  const template = path.join(fixture.layout.templates, 'official.xlsx');
  try {
    fixture.admin.createAdminSession({
      id: 'restore-session',
      sessionTokenHash: 'b'.repeat(64),
      username: 'admin',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
    const backup = await fixture.service.createBackup({ label: 'successful-restore' });
    const backupRoot = path.join(fixture.layout.backups, backup.id);
    fs.writeFileSync(template, 'changed-after-backup');
    const restored = await fixture.service.restore(backupRoot, true, backup.id) as {
      dryRun: boolean; restartRequired: boolean;
    };
    assert.equal(restored.dryRun, false);
    assert.equal(restored.restartRequired, true);
    assert.equal(fs.readFileSync(template, 'utf8'), 'template');
    const check = new DatabaseSync(path.join(fixture.layout.data, 'extincheck-local.sqlite'), { readOnly: true });
    const integrity = check.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const sessions = check.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get() as { count: number };
    check.close();
    assert.equal(integrity.integrity_check, 'ok');
    assert.equal(sessions.count, 0);
  } finally {
    fixture.removeOnly();
  }
});

test('restore failure during report swap rolls database, template and reports back together', async () => {
  const fixture = createFixture();
  const report = path.join(fixture.layout.reports, 'pilot.xlsx');
  const template = path.join(fixture.layout.templates, 'official.xlsx');
  try {
    fs.writeFileSync(report, 'backup-report');
    const backup = await fixture.service.createBackup({ label: 'report-rollback' });
    const backupRoot = path.join(fixture.layout.backups, backup.id);
    fs.writeFileSync(report, 'current-report');
    fs.writeFileSync(template, 'current-template');
    await assert.rejects(
      () => fixture.service.restore(backupRoot, true, backup.id, 'during-report-swap'),
      /reportes/
    );
    assert.equal(fs.readFileSync(report, 'utf8'), 'current-report');
    assert.equal(fs.readFileSync(template, 'utf8'), 'current-template');
  } finally {
    fixture.removeOnly();
  }
});

function createFixture(options: { tempAgeHours?: number } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-operations-'));
  const layout = createStorageLayout({ root });
  for (const directory of Object.values(layout)) {
    if (directory !== layout.root) fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(path.join(layout.templates, 'official.xlsx'), 'template');
  const databasePath = path.join(layout.data, 'extincheck-local.sqlite');
  const database = new LocalDatabase(databasePath, layout);
  const admin = new AdminRepository(databasePath);
  const logger = new StructuredLogger(layout.logs, 'debug', 7);
  const service = new OperationalService(database, admin, {
    storage: layout,
    logLevel: 'debug',
    logRetentionDays: 7,
    backupRetentionDays: 30,
    minFreeDiskMb: 1,
    tempFileMaxAgeHours: options.tempAgeHours ?? 24,
    windowsAutostartMode: 'none',
  }, new MaintenanceCoordinator(), logger);
  let closed = false;
  return {
    layout,
    database,
    admin,
    service,
    close() {
      if (!closed) {
        database.close();
        admin.close();
        closed = true;
      }
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
    removeOnly() {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
