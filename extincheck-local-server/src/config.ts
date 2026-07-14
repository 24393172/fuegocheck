import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function portFromEnvironment(): number {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export const config = {
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: portFromEnvironment(),
  databasePath: path.resolve(projectRoot, process.env.DATABASE_PATH?.trim() || './data/extincheck-local.sqlite'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:19006')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

