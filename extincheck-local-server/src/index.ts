import { createApp } from './app.js';
import { AdminRepository } from './admin-repository.js';
import { config } from './config.js';
import { LocalDatabase } from './database.js';
import { ExtinguisherReportService } from './report-generator.js';

const database = new LocalDatabase(config.databasePath);
const adminRepository = new AdminRepository(config.databasePath);
const reportService = new ExtinguisherReportService(
  database,
  config.templatePath,
  config.generatedReportsPath
);
const app = createApp(
  database,
  config.corsOrigins,
  reportService,
  adminRepository,
  config.adminWebPath
);
const server = app.listen(config.port, config.host, () => {
  console.log(`ExtinCheck Local Server listening on http://${config.host}:${config.port}`);
  console.log(`SQLite database: ${database.filePath}`);
  console.log(`Extinguisher template: ${reportService.templatePath}`);
  console.log(`Generated reports: ${reportService.reportsDirectory}`);
  console.log(`Admin panel: http://${config.host}:${config.port}/admin`);
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
