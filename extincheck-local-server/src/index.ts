import { createApp } from './app.js';
import { config } from './config.js';
import { LocalDatabase } from './database.js';

const database = new LocalDatabase(config.databasePath);
const app = createApp(database, config.corsOrigins);
const server = app.listen(config.port, config.host, () => {
  console.log(`ExtinCheck Local Server listening on http://${config.host}:${config.port}`);
  console.log(`SQLite database: ${database.filePath}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

