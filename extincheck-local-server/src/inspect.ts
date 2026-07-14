import { config } from './config.js';
import { LocalDatabase } from './database.js';

const database = new LocalDatabase(config.databasePath);
console.log(JSON.stringify(database.summary(), null, 2));
database.close();

