import { AdminRepository } from './admin-repository.js';
import { config } from './config.js';

const repository = new AdminRepository(config.databasePath);
try {
  console.log(JSON.stringify(repository.seedExampleData(), null, 2));
} finally {
  repository.close();
}
