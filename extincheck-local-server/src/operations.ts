import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AdminRepository } from './admin-repository.js';
import { OperationalConfig } from './config.js';
import { LocalDatabase } from './database.js';
import { MaintenanceCoordinator } from './maintenance.js';
import { CURRENT_SCHEMA_VERSION, configureSqlite, readSchemaVersion } from './schema-version.js';
import { isPathInside, resolveStoredPath, StorageLayout } from './storage-paths.js';
import { StructuredLogger } from './logger.js';
import { SERVER_VERSION } from './version.js';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

export interface BackupManifest {
  backupVersion: 1;
  id: string;
  createdAt: string;
  completedAt: string;
  applicationVersion: string;
  gitCommit: string;
  sourcePlatform: string;
  nodeVersion: string;
  backupMode: 'vacuum-into';
  status: 'valid';
  durationMs: number;
  schemaVersion: number;
  sourceVolume: string;
  backupVolume: string;
  externalStorageRecommended: boolean;
  warnings: string[];
  databaseIntegrity: { integrityCheck: 'ok'; foreignKeyCheck: 'ok' };
  templateHash: string | null;
  counts: {
    inspections: number; reports: number; companies: number; branches: number;
    locations: number; signatures: number; evidence: number; thumbnails: number;
  };
  totalFiles: number;
  totalSizeBytes: number;
  database: { relativePath: string; tableCounts: Record<string, number> };
  files: Array<{
    relativePath: string;
    sizeBytes: number;
    sha256: string;
    category: 'database' | 'template' | 'report' | 'signature' | 'evidence' | 'thumbnail' | 'metadata';
  }>;
}

export class OperationalService {
  private backupRunning = false;
  private lastBackupOperation: { status: 'completed' | 'failed'; at: string; message?: string } | null = null;

  constructor(
    readonly database: LocalDatabase,
    readonly adminRepository: AdminRepository,
    readonly config: OperationalConfig,
    readonly coordinator: MaintenanceCoordinator,
    readonly logger: StructuredLogger
  ) {}

  status() {
    const backups = this.listBackups();
    const disk = this.diskStatus(this.config.storage.root);
    const audit = this.storageAudit();
    const templatePath = activeTemplate(this.config.storage.templates);
    const addresses = localAddresses();
    return {
      schemaVersion: this.database.schemaVersion(),
      maintenance: this.coordinator.status(),
      backupRunning: this.backupRunning,
      lastBackupOperation: this.lastBackupOperation,
      lastBackup: backups[0] ?? null,
      disk,
      externalBackupRecommended:
        path.parse(this.config.storage.root).root.toLowerCase()
        === path.parse(this.config.storage.backups).root.toLowerCase(),
      lastBackupAgeHours: backups[0]
        ? Math.floor((Date.now() - new Date(backups[0].completedAt).getTime()) / 3_600_000) : null,
      storageAnomalies: audit.errors.length + audit.warnings.length,
      incompleteBackups: audit.warnings.filter((item) => item.type === 'incomplete-backup').length,
      pendingFiles: audit.warnings.filter((item) => ['pending', 'temporary'].includes(item.type)).length,
      template: {
        available: Boolean(templatePath),
        sha256: templatePath ? sha256(templatePath) : null,
        expectedSha256: this.config.expectedTemplateSha256 ?? null,
        matchesExpected: templatePath && this.config.expectedTemplateSha256
          ? sha256(templatePath) === this.config.expectedTemplateSha256 : null,
      },
      directories: Object.fromEntries(
        ['data', 'reports', 'templates', 'backups', 'logs', 'temp'].map((name) => [
          name,
          directoryWritable(this.config.storage[name as keyof StorageLayout]),
        ])
      ),
      logs: {
        writable: directoryWritable(this.config.storage.logs),
        ...this.logsReport(),
      },
      network: {
        addresses,
        primaryAddress: addresses[0]?.address ?? null,
        multipleInterfaces: addresses.length > 1,
      },
    };
  }

  async createBackup(options: { output?: string; label?: string } = {}) {
    if (this.backupRunning) throw new Error('Ya hay un respaldo en ejecución.');
    this.backupRunning = true;
    try {
      return await this.coordinator.runExclusive('backup', async () => {
        const base = options.output ? path.resolve(options.output) : this.config.storage.backups;
        this.validateBackupDestination(base);
        const estimatedBytes = directorySize(this.config.storage.data)
          + directorySize(this.config.storage.reports)
          + directorySize(this.config.storage.templates);
        this.ensureFreeSpace(base, estimatedBytes);
        fs.mkdirSync(base, { recursive: true });
        const releaseLock = acquireProcessLock(path.join(base, '.backup.lock'));
        try {
          const startedAt = Date.now();
          const baseId = `${timestamp()}${options.label ? `-${safeLabel(options.label)}` : ''}`;
          const id = fs.existsSync(path.join(base, baseId)) || fs.existsSync(path.join(base, `${baseId}.pending`))
            ? `${baseId}-${crypto.randomUUID().slice(0, 8)}` : baseId;
          const pending = path.join(base, `${id}.pending`);
          const final = path.join(base, id);
          fs.mkdirSync(pending, { recursive: false });
          const createdAt = new Date().toISOString();
          try {
          const databaseRelative = 'data/extincheck-local.sqlite';
          const databaseTarget = path.join(pending, databaseRelative);
          this.database.checkpoint();
          this.database.backupTo(databaseTarget);
          const snapshot = new DatabaseSync(databaseTarget);
          configureSqlite(snapshot);
          snapshot.exec('DELETE FROM admin_sessions;');
          snapshot.exec('PRAGMA wal_checkpoint(TRUNCATE);');
          snapshot.exec('PRAGMA journal_mode = DELETE;');
          const integrity = snapshot.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
          const foreignKeys = snapshot.prepare('PRAGMA foreign_key_check').all();
          const copiedTableCounts = sqliteTableCounts(snapshot);
          snapshot.close();
          if (!integrity.every((row) => row.integrity_check === 'ok') || foreignKeys.length) {
            throw new Error('La copia SQLite no superó las validaciones de integridad.');
          }
          copyTree(this.config.storage.templates, path.join(pending, 'templates'));
          copyTree(this.config.storage.reports, path.join(pending, 'generated-reports'), isOperationalFile);
          copyTree(this.config.storage.signatures, path.join(pending, 'data/signatures'), isOperationalFile);
          copyTree(this.config.storage.evidence, path.join(pending, 'data/evidence'), isOperationalFile);
          const files = inventory(pending).filter((file) => file.path !== 'manifest.json');
          const manifestFiles = files.map((file) => ({
            relativePath: file.path,
            sizeBytes: file.size,
            sha256: file.sha256,
            category: fileCategory(file.path),
          }));
          const sameVolume =
            path.parse(this.config.storage.root).root.toLowerCase() === path.parse(base).root.toLowerCase();
          const template = manifestFiles.find((file) => file.category === 'template');
          const manifest: BackupManifest = {
            backupVersion: 1,
            id,
            createdAt,
            completedAt: new Date().toISOString(),
            applicationVersion: SERVER_VERSION,
            gitCommit: gitCommit(this.config.storage.root),
            sourcePlatform: `${process.platform}-${process.arch}`,
            nodeVersion: process.version,
            backupMode: 'vacuum-into',
            status: 'valid',
            durationMs: Date.now() - startedAt,
            schemaVersion: this.database.schemaVersion(),
            sourceVolume: path.parse(this.config.storage.root).root || 'relative',
            backupVolume: path.parse(base).root || 'relative',
            externalStorageRecommended: sameVolume,
            warnings: sameVolume
              ? ['Este respaldo está en el mismo disco que los datos originales.'] : [],
            databaseIntegrity: { integrityCheck: 'ok', foreignKeyCheck: 'ok' },
            templateHash: template?.sha256 ?? null,
            counts: {
              inspections: copiedTableCounts.inspections ?? 0,
              reports: copiedTableCounts.generated_reports ?? 0,
              companies: copiedTableCounts.companies ?? 0,
              branches: copiedTableCounts.branches ?? 0,
              locations: copiedTableCounts.equipment_locations ?? 0,
              signatures: copiedTableCounts.inspection_signatures ?? 0,
              evidence: copiedTableCounts.inspection_evidence ?? 0,
              thumbnails: manifestFiles.filter((file) => file.category === 'thumbnail').length,
            },
            totalFiles: manifestFiles.length,
            totalSizeBytes: manifestFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
            database: {
              relativePath: databaseRelative,
              tableCounts: copiedTableCounts,
            },
            files: manifestFiles,
          };
          atomicJson(path.join(pending, 'manifest.json'), manifest);
          verifyManifest(pending, manifest);
          fs.renameSync(pending, final);
          this.logger.log('info', 'backup.completed', { backupId: id, fileCount: manifestFiles.length });
          this.lastBackupOperation = { status: 'completed', at: manifest.completedAt };
            return { ...manifest, directoryName: path.basename(final) };
          } catch (error) {
            this.lastBackupOperation = {
              status: 'failed',
              at: new Date().toISOString(),
              message: error instanceof Error ? error.message : 'Error desconocido',
            };
            this.logger.log('error', 'backup.failed', {
              backupId: id,
              message: error instanceof Error ? error.message : 'Error desconocido',
            });
            throw error;
          }
        } finally {
          releaseLock();
        }
      });
    } finally {
      this.backupRunning = false;
    }
  }

  listBackups() {
    const base = this.config.storage.backups;
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.endsWith('.pending'))
      .flatMap((entry) => {
        try {
          const manifest = readManifest(path.join(base, entry.name));
          return [{
            id: entry.name,
            createdAt: manifest.createdAt,
            completedAt: manifest.completedAt,
            files: manifest.totalFiles,
            sizeBytes: manifest.totalSizeBytes,
            version: manifest.applicationVersion,
            status: manifest.status,
          }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  manifest(backupId: string) {
    return readManifest(this.backupDirectory(backupId));
  }

  verifyBackup(backupPath: string) {
    const root = path.resolve(backupPath);
    const manifest = readManifest(root);
    verifyManifest(root, manifest);
    if (manifest.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(`El respaldo usa un esquema más reciente (${manifest.schemaVersion}).`);
    }
    const snapshot = new DatabaseSync(path.join(root, manifest.database.relativePath), { readOnly: true });
    snapshot.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
    const version = readSchemaVersion(snapshot);
    const integrity = snapshot.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    const foreignKeys = snapshot.prepare('PRAGMA foreign_key_check').all();
    const tableCounts = sqliteTableCounts(snapshot);
    snapshot.close();
    if (version !== manifest.schemaVersion
        || !integrity.every((row) => row.integrity_check === 'ok')
        || foreignKeys.length
        || JSON.stringify(tableCounts) !== JSON.stringify(manifest.database.tableCounts)) {
      throw new Error('El respaldo no superó la verificación SQLite.');
    }
    return { valid: true, manifest };
  }

  async restore(
    backupPath: string,
    apply = false,
    confirm = '',
    testFailureStage?: 'before-swap' | 'after-first-swap' | 'during-report-swap' | 'after-validation'
  ) {
    const resolvedBackup = path.resolve(backupPath);
    if (!isPathInside(this.config.storage.backups, resolvedBackup)) {
      throw new Error('La restauración solo acepta respaldos dentro de BACKUP_DIRECTORY.');
    }
    const verified = this.verifyBackup(resolvedBackup);
    this.ensureFreeSpace(this.config.storage.root, verified.manifest.totalSizeBytes * 2);
    const plan = {
      dryRun: !apply,
      backupId: verified.manifest.id,
      schemaVersion: verified.manifest.schemaVersion,
      files: verified.manifest.totalFiles,
      actions: ['respaldo preventivo', 'staging', 'intercambio atómico', 'revocar sesiones', 'normalizar rutas'],
    };
    if (!apply) return plan;
    if (confirm !== verified.manifest.id) throw new Error('La confirmación no coincide con el ID del respaldo.');
    const preventive = await this.createBackup({ label: 'pre-restore' });
    return this.coordinator.runExclusive('restore', async () => {
      const source = resolvedBackup;
      const staging = path.join(this.config.storage.temp, `restore-${crypto.randomUUID()}`);
      fs.mkdirSync(staging, { recursive: true });
      try {
        copyTree(source, staging, isOperationalFile);
        if (testFailureStage === 'before-swap') {
          throw new Error('Fallo de restauración inyectado antes del intercambio.');
        }
        this.database.close();
        this.adminRepository.close();
        const swaps = [
          { source: path.join(staging, verified.manifest.database.relativePath), target: this.database.filePath },
          { source: path.join(staging, 'templates'), target: this.config.storage.templates },
          { source: path.join(staging, 'generated-reports'), target: this.config.storage.reports },
          { source: path.join(staging, 'data/signatures'), target: this.config.storage.signatures },
          { source: path.join(staging, 'data/evidence'), target: this.config.storage.evidence },
        ].filter((item) => fs.existsSync(item.source));
        const completed: Array<{ target: string; rollback: string | null }> = [];
        try {
          for (const [index, item] of swaps.entries()) {
            fs.mkdirSync(path.dirname(item.target), { recursive: true });
            const rollback = fs.existsSync(item.target)
              ? `${item.target}.restore-rollback-${crypto.randomUUID()}` : null;
            if (rollback) fs.renameSync(item.target, rollback);
            fs.renameSync(item.source, item.target);
            completed.push({ target: item.target, rollback });
            if (index === 0 && testFailureStage === 'after-first-swap') {
              throw new Error('Fallo de restauración inyectado después del primer intercambio.');
            }
            if (index === 2 && testFailureStage === 'during-report-swap') {
              throw new Error('Fallo de restauración inyectado durante el intercambio de reportes.');
            }
          }
          const restoredDatabase = new LocalDatabase(this.database.filePath, this.config.storage);
          const restoredIntegrity = restoredDatabase.integrity();
          if (!restoredIntegrity.ok) {
            restoredDatabase.close();
            throw new Error('La base restaurada no superó la validación final.');
          }
          restoredDatabase.close();
          const restoredAdmin = new AdminRepository(this.database.filePath);
          restoredAdmin.revokeAllAdminSessions();
          restoredAdmin.close();
          if (testFailureStage === 'after-validation') {
            throw new Error('Fallo de restauración inyectado después de validar.');
          }
          for (const item of completed) {
            if (item.rollback) fs.rmSync(item.rollback, { recursive: true, force: true });
          }
        } catch (error) {
          for (const item of completed.reverse()) {
            fs.rmSync(item.target, { recursive: true, force: true });
            if (item.rollback) fs.renameSync(item.rollback, item.target);
          }
          throw error;
        }
        this.logger.log('warn', 'restore.completed', {
          backupId: verified.manifest.id,
          preventiveBackupId: preventive.id,
        });
        return { ...plan, dryRun: false, preventiveBackupId: preventive.id, restartRequired: true };
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    });
  }

  storageReport() {
    const directories = Object.entries(this.config.storage)
      .filter(([name]) => name !== 'root')
      .map(([name, directory]) => ({
      name,
      bytes: directorySize(directory),
      files: countFiles(directory),
    }));
    const databaseFiles = [
      this.database.filePath,
      `${this.database.filePath}-wal`,
      `${this.database.filePath}-shm`,
    ].map((filePath) => ({
      name: path.basename(filePath),
      bytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
      present: fs.existsSync(filePath),
    }));
    const largestFiles = [
      this.config.storage.data,
      this.config.storage.reports,
      this.config.storage.templates,
      this.config.storage.backups,
      this.config.storage.logs,
      this.config.storage.temp,
    ].flatMap(collectFiles)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 20)
      .map((item) => ({
        relativePath: path.relative(this.config.storage.root, item.filePath).replaceAll(path.sep, '/'),
        bytes: item.bytes,
      }));
    const lastBackup = this.listBackups()[0] ?? null;
    return {
      generatedAt: new Date().toISOString(),
      disk: this.diskStatus(this.config.storage.root),
      databaseFiles,
      directories,
      totalBytes: directories.reduce((sum, item) => sum + item.bytes, 0),
      largestFiles,
      lastBackup,
      lastBackupAgeHours: lastBackup
        ? Math.floor((Date.now() - new Date(lastBackup.completedAt).getTime()) / 3_600_000) : null,
    };
  }

  storageAudit() {
    const errors: Array<{ type: string; path: string; detail: string }> = [];
    const warnings: Array<{ type: string; path: string; detail: string }> = [];
    const correct: Array<{ type: string; detail: string }> = [];
    const registered = new Set<string>();
    for (const row of this.database.storagePathRows()) {
      if (path.isAbsolute(row.stored_path)) {
        warnings.push({ type: 'legacy-absolute-path', path: row.stored_path, detail: `${row.table_name}.${row.column_name}` });
      }
      try {
        const resolved = resolveStoredPath(row.stored_path, this.config.storage);
        registered.add(path.resolve(resolved).toLowerCase());
        if (!fs.existsSync(resolved)) {
          errors.push({ type: 'registered-file-missing', path: portableDisplay(row.stored_path), detail: `${row.table_name}:${row.id}` });
        } else if (row.checksum && sha256(resolved) !== row.checksum) {
          errors.push({ type: 'checksum-mismatch', path: portableDisplay(row.stored_path), detail: `${row.table_name}:${row.id}` });
        } else {
          correct.push({ type: 'registered-file', detail: `${row.table_name}:${row.id}` });
        }
      } catch {
        errors.push({ type: 'path-outside-storage', path: portableDisplay(row.stored_path), detail: `${row.table_name}:${row.id}` });
      }
    }
    for (const anomaly of this.database.storedPathAnomalies() as Array<any>) {
      warnings.push({
        type: 'stored-path-anomaly',
        path: portableDisplay(String(anomaly.stored_path)),
        detail: String(anomaly.reason),
      });
    }
    for (const directory of [
      this.config.storage.reports,
      this.config.storage.signatures,
      this.config.storage.evidence,
    ]) {
      for (const item of collectFiles(directory)) {
        if (!registered.has(path.resolve(item.filePath).toLowerCase())) {
          warnings.push({
            type: 'orphan-physical-file',
            path: path.relative(this.config.storage.root, item.filePath).replaceAll(path.sep, '/'),
            detail: 'No existe una fila SQLite que haga referencia al archivo.',
          });
        }
      }
    }
    const now = Date.now();
    for (const [kind, directory] of [['pending', this.config.storage.backups], ['temp', this.config.storage.temp]] as const) {
      if (!fs.existsSync(directory)) continue;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if ((kind === 'pending' && entry.name.endsWith('.pending'))
            || (kind === 'temp' && now - fs.statSync(target).mtimeMs > this.config.tempFileMaxAgeHours * 3_600_000)) {
          warnings.push({
            type: kind === 'pending' ? 'incomplete-backup' : 'temporary',
            path: path.relative(this.config.storage.root, target).replaceAll(path.sep, '/'),
            detail: kind === 'pending' ? 'Carpeta de respaldo incompleta.' : 'Temporal vencido.',
          });
        }
      }
    }
    if (fs.existsSync(this.config.storage.backups)) {
      for (const entry of fs.readdirSync(this.config.storage.backups, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.endsWith('.pending')) continue;
        try {
          const verified = this.verifyBackup(path.join(this.config.storage.backups, entry.name));
          correct.push({ type: 'valid-backup', detail: entry.name });
          const ageDays = (Date.now() - new Date(verified.manifest.completedAt).getTime()) / 86_400_000;
          if (ageDays > this.config.backupRetentionDays) {
            warnings.push({
              type: 'backup-retention-exceeded',
              path: `backups/${entry.name}`,
              detail: `Respaldo válido con ${Math.floor(ageDays)} días; revisar política manualmente.`,
            });
          }
        } catch (error) {
          errors.push({
            type: 'invalid-backup',
            path: `backups/${entry.name}`,
            detail: error instanceof Error ? error.message : 'Respaldo inválido.',
          });
        }
      }
    }
    const byHash = new Map<string, string[]>();
    for (const directory of [this.config.storage.reports, this.config.storage.signatures, this.config.storage.evidence]) {
      for (const item of collectFiles(directory)) {
        const hash = sha256(item.filePath);
        byHash.set(hash, [...(byHash.get(hash) ?? []), item.filePath]);
      }
    }
    for (const paths of byHash.values()) {
      if (paths.length > 1) {
        warnings.push({
          type: 'duplicate-content',
          path: paths.map((item) => path.relative(this.config.storage.root, item).replaceAll(path.sep, '/')).join(', '),
          detail: 'Varios archivos tienen el mismo SHA-256.',
        });
      }
    }
    for (const directory of [this.config.storage.reports, this.config.storage.signatures, this.config.storage.evidence]) {
      if (!fs.existsSync(directory)) continue;
      for (const item of collectFiles(directory)) {
        if (/\.(pending|tmp|backup)$/i.test(item.filePath)) {
          warnings.push({
            type: 'temporary',
            path: path.relative(this.config.storage.root, item.filePath).replaceAll(path.sep, '/'),
            detail: 'Archivo temporal interno.',
          });
        }
      }
    }
    return {
      generatedAt: new Date().toISOString(),
      errors,
      warnings,
      correct,
      suggestions: [
        'No elimines archivos registrados sin un respaldo verificado.',
        'Ejecuta storage:cleanup primero sin --apply para revisar temporales autorizados.',
      ],
    };
  }

  async cleanup(apply = false, confirm = '') {
    const audit = this.storageAudit();
    const candidates = audit.warnings.filter((item) =>
      item.type === 'incomplete-backup' || item.type === 'temporary');
    if (!apply) return { dryRun: true, candidates };
    if (confirm !== 'CLEANUP') throw new Error('Se requiere --confirm CLEANUP.');
    return this.coordinator.runExclusive('cleanup', () => {
      let removed = 0;
      for (const item of candidates) {
        const target = path.resolve(this.config.storage.root, item.path);
        const allowed = (item.type === 'incomplete-backup'
            && isPathInside(this.config.storage.backups, target))
          || (item.type === 'temporary' && isPathInside(this.config.storage.temp, target));
        if (!allowed) continue;
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
      }
      removed += this.logger.cleanup();
      this.logger.log('info', 'storage.cleanup', { removed });
      return { dryRun: false, removed };
    });
  }

  logsReport() {
    const files = collectFiles(this.config.storage.logs).filter((item) => item.filePath.endsWith('.jsonl'));
    return {
      files: files.length,
      bytes: files.reduce((sum, item) => sum + item.bytes, 0),
      oldestAt: files.length ? new Date(Math.min(...files.map((item) => fs.statSync(item.filePath).mtimeMs))).toISOString() : null,
      newestAt: files.length ? new Date(Math.max(...files.map((item) => fs.statSync(item.filePath).mtimeMs))).toISOString() : null,
    };
  }

  logsCleanup() {
    const removed = this.logger.cleanup();
    this.logger.log('info', 'logs.cleanup', { removed });
    return { removed, retentionDays: this.config.logRetentionDays };
  }

  ensureFreeSpace(directory: string, estimatedBytes = 0) {
    const disk = this.diskStatus(directory);
    const estimatedMb = Math.ceil(estimatedBytes / 1024 / 1024);
    if (disk.freeBytes < this.config.minFreeDiskMb * 1024 * 1024 + estimatedBytes) {
      this.logger.log('warn', 'storage.insufficient-space', {
        freeMb: disk.freeMb,
        minimumMb: this.config.minFreeDiskMb,
        estimatedMb,
      });
      throw new Error(
        `Espacio insuficiente: ${disk.freeMb} MB libres; se requieren ${this.config.minFreeDiskMb + estimatedMb} MB.`
      );
    }
  }

  private diskStatus(directory: string) {
    const existing = nearestExisting(directory);
    const stats = fs.statfsSync(existing);
    const freeBytes = Number(stats.bavail * stats.bsize);
    const freeMb = Math.floor(freeBytes / 1024 / 1024);
    return { freeBytes, freeMb, minimumMb: this.config.minFreeDiskMb, ok: freeMb >= this.config.minFreeDiskMb };
  }

  private validateBackupDestination(directory: string) {
    if ([this.config.storage.data, this.config.storage.reports, this.config.storage.templates]
      .some((source) => isPathInside(source, directory) || isPathInside(directory, source))) {
      throw new Error('El destino del respaldo no puede contener ni estar dentro de una carpeta fuente.');
    }
    if (isPathInside(this.config.storage.temp, directory)) {
      throw new Error('El destino del respaldo no puede estar dentro de temporales.');
    }
  }

  private backupDirectory(backupId: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(backupId)) throw new Error('ID de respaldo inválido.');
    const target = path.join(this.config.storage.backups, backupId);
    if (!isPathInside(this.config.storage.backups, target)) throw new Error('ID de respaldo inválido.');
    return target;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '');
}
function safeLabel(value: string) {
  return value.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'backup';
}
function isOperationalFile(source: string) {
  const name = path.basename(source).toLowerCase();
  return !name.startsWith('.env') && !name.endsWith('.log') && !name.endsWith('.pending')
    && !name.endsWith('-wal') && !name.endsWith('-shm') && !name.endsWith('.lock');
}
function copyTree(source: string, target: string, include: (source: string) => boolean = () => true) {
  if (!fs.existsSync(source)) return;
  const stat = fs.statSync(source);
  if (!include(source)) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) copyTree(path.join(source, entry), path.join(target, entry), include);
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}
function inventory(root: string) {
  const output: Array<{ path: string; size: number; sha256: string }> = [];
  const walk = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) output.push({
        path: path.relative(root, target).replaceAll(path.sep, '/'),
        size: fs.statSync(target).size,
        sha256: sha256(target),
      });
    }
  };
  walk(root);
  return output.sort((a, b) => a.path.localeCompare(b.path));
}
function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function atomicJson(target: string, value: unknown) {
  const temporary = path.join(path.dirname(target), 'manifest.pending.json');
  fs.rmSync(temporary, { force: true });
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, target);
}
function readManifest(root: string): BackupManifest {
  const manifestPath = path.join(root, 'manifest.json');
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
  if (parsed.backupVersion !== 1 || parsed.status !== 'valid' || !Array.isArray(parsed.files)) {
    throw new Error('Manifiesto de respaldo inválido.');
  }
  return parsed;
}
function verifyManifest(root: string, manifest: BackupManifest) {
  const actual = inventory(root).filter((item) => item.path !== 'manifest.json');
  if (actual.length !== manifest.files.length
      || actual.some((item, index) => item.path !== manifest.files[index]?.relativePath)) {
    throw new Error('El contenido del respaldo no coincide con el manifiesto.');
  }
  for (const item of manifest.files) {
    if (path.isAbsolute(item.relativePath) || item.relativePath.split('/').includes('..')) {
      throw new Error('Ruta insegura en el manifiesto.');
    }
    const target = path.resolve(root, item.relativePath);
    if (!isPathInside(root, target) || !fs.existsSync(target)) {
      throw new Error(`Archivo faltante: ${item.relativePath}`);
    }
    if (fs.statSync(target).size !== item.sizeBytes || sha256(target) !== item.sha256) {
      throw new Error(`Hash inválido: ${item.relativePath}`);
    }
  }
}
function directorySize(directory: string): number {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const target = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? directorySize(target) : entry.isFile() ? fs.statSync(target).size : 0);
  }, 0);
}
function countFiles(directory: string): number {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const target = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? countFiles(target) : entry.isFile() ? 1 : 0);
  }, 0);
}
function nearestExisting(target: string): string {
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error('No se encontró un volumen accesible.');
    current = parent;
  }
  return current;
}
function activeTemplate(directory: string): string | null {
  if (!fs.existsSync(directory)) return null;
  const preferred = path.join(directory, 'FORMATOS P.R. CANCUN.xlsx');
  if (fs.existsSync(preferred)) return preferred;
  const first = fs.readdirSync(directory)
    .find((name) => name.toLowerCase().endsWith('.xlsx'));
  return first ? path.join(directory, first) : null;
}
function directoryWritable(directory: string): boolean {
  try {
    const existing = nearestExisting(directory);
    fs.accessSync(existing, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
function collectFiles(directory: string): Array<{ filePath: string; bytes: number }> {
  if (!fs.existsSync(directory)) return [];
  const output: Array<{ filePath: string; bytes: number }> = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) output.push({ filePath: target, bytes: fs.statSync(target).size });
    }
  };
  walk(directory);
  return output;
}
function portableDisplay(value: string) {
  if (!path.isAbsolute(value)) return value.replaceAll('\\', '/');
  return `[absolute]/${path.basename(value)}`;
}
function localAddresses() {
  const ignored = /loopback|virtual|vmware|hyper-v|wsl|vethernet|bluetooth|docker|tunnel/i;
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) => {
    if (ignored.test(name)) return [];
    return (addresses ?? [])
      .filter((address) => address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.'))
      .map((address) => ({ name, address: address.address }));
  });
}
function sqliteTableCounts(database: DatabaseSync): Record<string, number> {
  const tables = database.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => {
    const escaped = name.replaceAll('"', '""');
    const row = database.prepare(`SELECT COUNT(*) AS count FROM "${escaped}"`).get() as { count: number };
    return [name, row.count];
  }));
}
function fileCategory(relativePath: string): BackupManifest['files'][number]['category'] {
  if (relativePath === 'data/extincheck-local.sqlite') return 'database';
  if (relativePath.startsWith('templates/')) return 'template';
  if (relativePath.startsWith('generated-reports/')) return 'report';
  if (relativePath.startsWith('data/signatures/')) return 'signature';
  if (relativePath.includes('/thumbnails/')) return 'thumbnail';
  if (relativePath.startsWith('data/evidence/')) return 'evidence';
  return 'metadata';
}
function gitCommit(cwd: string) {
  const configured = process.env.GIT_COMMIT?.trim();
  if (configured && /^[a-f0-9]{7,40}$/i.test(configured)) return configured;
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2_000,
    }).trim();
  } catch {
    return 'unknown';
  }
}
function acquireProcessLock(filePath: string): () => void {
  if (fs.existsSync(filePath)) {
    try {
      const { pid } = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { pid?: number };
      if (pid) {
        try {
          process.kill(pid, 0);
          throw new Error('Ya hay un respaldo en ejecución en otro proceso.');
        } catch (error) {
          if (error instanceof Error && error.message.includes('otro proceso')) throw error;
          fs.rmSync(filePath, { force: true });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('otro proceso')) throw error;
      fs.rmSync(filePath, { force: true });
    }
  }
  let descriptor: number;
  try {
    descriptor = fs.openSync(filePath, 'wx');
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } catch (error) {
    throw new Error('Ya hay un respaldo en ejecución en otro proceso.', { cause: error });
  }
  return () => {
    fs.closeSync(descriptor);
    fs.rmSync(filePath, { force: true });
  };
}
