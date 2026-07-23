import path from 'node:path';
import { AdminRepository } from './admin-repository.js';
import { loadConfig } from './config.js';
import { LocalDatabase } from './database.js';
import { StructuredLogger } from './logger.js';
import { MaintenanceCoordinator } from './maintenance.js';
import { OperationalService } from './operations.js';
import { assertServerStopped } from './instance-lock.js';

const [command = '', ...args] = process.argv.slice(2);
const config = loadConfig();
if (command === 'restore' && flag('--apply')) {
  assertServerStopped(config.operational.storage.data);
}
const database = new LocalDatabase(config.databasePath, config.operational.storage);
const adminRepository = new AdminRepository(config.databasePath);
const logger = new StructuredLogger(
  config.operational.storage.logs,
  config.operational.logLevel,
  config.operational.logRetentionDays
);
const service = new OperationalService(
  database,
  adminRepository,
  config.operational,
  new MaintenanceCoordinator(),
  logger
);
let connectionsClosed = false;
let humanOutput: string | null = null;

try {
  let result: unknown;
  switch (command) {
    case 'backup':
      result = await service.createBackup({
        output: option('--output'),
        label: option('--label'),
      });
      break;
    case 'backup:verify':
      result = service.verifyBackup(resolveBackupArgument(requiredOption('--backup')));
      break;
    case 'restore': {
      const backup = resolveBackupArgument(requiredOption('--backup'));
      const apply = flag('--apply');
      result = await service.restore(path.resolve(backup), apply, option('--confirm') ?? '');
      connectionsClosed = apply;
      break;
    }
    case 'storage:report':
      result = service.storageReport();
      if (!flag('--json')) {
        const report = result as ReturnType<OperationalService['storageReport']>;
        humanOutput = [
          `Espacio libre: ${report.disk.freeMb} MB`,
          `Uso operativo: ${report.totalBytes} bytes`,
          `Último respaldo: ${report.lastBackup?.id ?? 'ninguno'}`,
          ...report.directories.map((item) => `${item.name}: ${item.bytes} bytes, ${item.files} archivos`),
        ].join('\n');
      }
      break;
    case 'storage:audit':
      result = service.storageAudit();
      break;
    case 'storage:cleanup':
      result = await service.cleanup(flag('--apply'), option('--confirm') ?? '');
      break;
    case 'logs:report':
      result = service.logsReport();
      break;
    case 'logs:cleanup':
      result = service.logsCleanup();
      break;
    default:
      throw new Error(
        'Comando requerido: backup, backup:verify, restore, storage:report, storage:audit, storage:cleanup, logs:report o logs:cleanup.'
      );
  }
  process.stdout.write(humanOutput ? `${humanOutput}\n` : `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  logger.log('error', 'operations.cli.failed', {
    command,
    message: error instanceof Error ? error.message : 'Error desconocido',
  });
  process.stderr.write(`${error instanceof Error ? error.message : 'Error desconocido'}\n`);
  process.exitCode = 1;
} finally {
  if (!connectionsClosed) {
    database.close();
    adminRepository.close();
  }
}

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredOption(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function flag(name: string) {
  return args.includes(name);
}

function resolveBackupArgument(value: string) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(config.operational.storage.backups, value);
}
