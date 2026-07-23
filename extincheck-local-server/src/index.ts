import { createApp } from './app.js';
import { AdminRepository } from './admin-repository.js';
import { loadConfig } from './config.js';
import { LocalDatabase } from './database.js';
import { ExtinguisherReportService } from './report-generator.js';

const config = loadConfig();
const database = new LocalDatabase(config.databasePath);
const adminRepository = new AdminRepository(config.databasePath);
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
  config.security
);
const server = app.listen(config.port, config.host, () => {
  console.log(`ExtinCheck Local Server listening on http://${config.host}:${config.port}`);
  console.log(`Admin panel: http://${config.host}:${config.port}/admin`);
  console.log(`Security configuration: enabled (${config.security.nodeEnv})`);
});

function shutdown() {
  server.close(() => {
    database.close();
    adminRepository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
