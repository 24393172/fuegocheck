import { createApp } from './app.js';
import { AdminRepository } from './admin-repository.js';
import { loadConfig } from './config.js';
import { LocalDatabase } from './database.js';
import { ExtinguisherReportService } from './report-generator.js';
import { StructuredLogger } from './logger.js';
import { MaintenanceCoordinator } from './maintenance.js';
import { OperationalService } from './operations.js';
import { ServerInstanceLock } from './instance-lock.js';

const config = loadConfig();
const instanceLock = new ServerInstanceLock(config.operational.storage.data);
const database = new LocalDatabase(config.databasePath, config.operational.storage);
const adminRepository = new AdminRepository(config.databasePath);
const logger = new StructuredLogger(
  config.operational.storage.logs,
  config.operational.logLevel,
  config.operational.logRetentionDays
);
const coordinator = new MaintenanceCoordinator();
const operations = new OperationalService(
  database,
  adminRepository,
  config.operational,
  coordinator,
  logger
);
const reportService = new ExtinguisherReportService(
  database,
  config.templatePath,
  config.generatedReportsPath
);
const app = createApp(
  database,
  reportService,
  adminRepository,
  config.adminWebPath,
  config.security,
  operations
);
instanceLock.acquire();
const server = app.listen(config.port, config.host, () => {
  logger.log('info', 'server.started', {
    host: config.host,
    port: config.port,
    environment: config.security.nodeEnv,
    schemaVersion: database.schemaVersion(),
  });
  console.log(`ExtinCheck Local Server listening on http://${config.host}:${config.port}`);
});
server.once('error', () => {
  instanceLock.release();
  database.close();
  adminRepository.close();
});

function shutdown() {
  logger.log('info', 'server.stopping');
  server.close(() => {
    database.close();
    adminRepository.close();
    instanceLock.release();
    logger.log('info', 'server.stopped');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
