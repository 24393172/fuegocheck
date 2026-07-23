import { AdminRepository } from './admin-repository.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const repository = new AdminRepository(config.databasePath);
try {
  console.log(JSON.stringify(repository.seedExampleData(), null, 2));
} finally {
  repository.close();
}
