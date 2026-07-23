import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { createStorageLayout, StorageLayout, validateStorageLayout } from './storage-paths.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const productionModes = new Set(['production', 'local-production']);
const exampleMarkers = ['change-me', 'changeme', 'example', 'placeholder', 'replace-me', 'your-'];

export type ServerEnvironment = 'development' | 'test' | 'production' | 'local-production';

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

export interface SecurityConfig {
  nodeEnv: ServerEnvironment;
  adminUsername: string;
  adminPasswordHash: string;
  sessionSecret: string;
  sessionMaxAgeMs: number;
  localApiKey: string;
  allowedAdminOrigins: string[];
  trustProxy: boolean | number | string;
  rateLimits: {
    login: RateLimitConfig;
    mobileSync: RateLimitConfig;
    evidence: RateLimitConfig;
    download: RateLimitConfig;
    admin: RateLimitConfig;
  };
  bypassAuthenticationForTests?: boolean;
}

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  templatePath: string;
  generatedReportsPath: string;
  adminWebPath: string;
  security: SecurityConfig;
  operational: OperationalConfig;
}

export interface OperationalConfig {
  storage: StorageLayout;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logRetentionDays: number;
  backupRetentionDays: number;
  minFreeDiskMb: number;
  tempFileMaxAgeHours: number;
  windowsAutostartMode: 'task-scheduler' | 'pm2' | 'none';
  expectedTemplateSha256?: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV);
  const adminUsername = required(environment, 'ADMIN_USERNAME');
  const adminPasswordHash = required(environment, 'ADMIN_PASSWORD_HASH');
  const sessionSecret = required(environment, 'SESSION_SECRET');
  const localApiKey = required(environment, 'LOCAL_API_KEY');

  if (!/^\$2[aby]\$\d{2}\$/.test(adminPasswordHash)) {
    throw configurationError('ADMIN_PASSWORD_HASH debe ser un hash bcrypt válido.');
  }
  if (sessionSecret.length < 43) {
    throw configurationError('SESSION_SECRET debe contener al menos 43 caracteres.');
  }
  if (localApiKey.length < 32) {
    throw configurationError('LOCAL_API_KEY debe contener al menos 32 caracteres.');
  }
  if (productionModes.has(nodeEnv)) {
    const bcryptCost = Number(adminPasswordHash.slice(4, 6));
    if (!Number.isInteger(bcryptCost) || bcryptCost < 10) {
      throw configurationError('ADMIN_PASSWORD_HASH debe usar un costo bcrypt de al menos 10.');
    }
    for (const [name, value] of [
      ['ADMIN_PASSWORD_HASH', adminPasswordHash],
      ['SESSION_SECRET', sessionSecret],
      ['LOCAL_API_KEY', localApiKey],
    ] as const) {
      if (looksLikeExample(value)) {
        throw configurationError(`${name} no puede usar un valor de ejemplo en modo real.`);
      }
    }
  }

  const databasePath = resolveProjectPath(environment.DATABASE_PATH, './data/extincheck-local.sqlite');
  const templatePath = resolveProjectPath(
    environment.EXTINGUISHERS_TEMPLATE_PATH,
    './templates/FORMATOS P.R. CANCUN.xlsx'
  );
  const generatedReportsPath = resolveProjectPath(environment.GENERATED_REPORTS_PATH, './generated-reports');
  const storage = createStorageLayout({
    root: projectRoot,
    data: path.dirname(databasePath),
    reports: generatedReportsPath,
    templates: path.dirname(templatePath),
    backups: resolveProjectPath(environment.BACKUP_DIRECTORY, './backups'),
    logs: resolveProjectPath(environment.LOG_DIRECTORY, './logs'),
    temp: resolveProjectPath(environment.TEMP_DIRECTORY, './temp'),
  });
  validateStorageLayout(storage);

  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: parseInteger(environment.PORT, 3001, 1, 65535, 'PORT'),
    databasePath,
    templatePath,
    generatedReportsPath,
    adminWebPath: resolveProjectPath(environment.ADMIN_WEB_PATH, './admin-web/dist'),
    security: {
      nodeEnv,
      adminUsername,
      adminPasswordHash,
      sessionSecret,
      sessionMaxAgeMs:
        parseNumber(environment.SESSION_MAX_AGE_HOURS, 12, 0.25, 168, 'SESSION_MAX_AGE_HOURS')
        * 60 * 60 * 1000,
      localApiKey,
      allowedAdminOrigins: parseOrigins(environment.ALLOWED_ADMIN_ORIGINS),
      trustProxy: parseTrustProxy(environment.TRUST_PROXY),
      rateLimits: {
        login: rateLimit(environment, 'LOGIN_RATE_LIMIT', 15 * 60_000, 5),
        mobileSync: rateLimit(environment, 'MOBILE_SYNC_RATE_LIMIT', 60_000, 120),
        evidence: rateLimit(environment, 'EVIDENCE_RATE_LIMIT', 60_000, 300),
        download: rateLimit(environment, 'DOWNLOAD_RATE_LIMIT', 60_000, 120),
        admin: rateLimit(environment, 'ADMIN_RATE_LIMIT', 60_000, 600),
      },
    },
    operational: {
      storage,
      logLevel: parseEnum(environment.LOG_LEVEL, ['debug', 'info', 'warn', 'error'], 'info', 'LOG_LEVEL'),
      logRetentionDays: parseInteger(environment.LOG_RETENTION_DAYS, 30, 1, 3650, 'LOG_RETENTION_DAYS'),
      backupRetentionDays: parseInteger(environment.BACKUP_RETENTION_DAYS, 30, 1, 3650, 'BACKUP_RETENTION_DAYS'),
      minFreeDiskMb: parseInteger(environment.MIN_FREE_DISK_MB, 512, 1, 1_000_000, 'MIN_FREE_DISK_MB'),
      tempFileMaxAgeHours: parseInteger(environment.TEMP_FILE_MAX_AGE_HOURS, 24, 1, 8760, 'TEMP_FILE_MAX_AGE_HOURS'),
      windowsAutostartMode: parseEnum(
        environment.WINDOWS_AUTOSTART_MODE,
        ['task-scheduler', 'pm2', 'none'],
        'task-scheduler',
        'WINDOWS_AUTOSTART_MODE'
      ),
      expectedTemplateSha256: parseOptionalSha256(environment.EXPECTED_TEMPLATE_SHA256),
    },
  };
}

function parseOptionalSha256(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    throw configurationError('EXPECTED_TEMPLATE_SHA256 debe ser un SHA-256 hexadecimal.');
  }
  return normalized.toLowerCase();
}

export function createTestSecurityConfig(
  overrides: Partial<SecurityConfig> = {}
): SecurityConfig {
  return {
    nodeEnv: 'test',
    adminUsername: 'test-admin',
    adminPasswordHash: '$2b$12$YvDdmEuHWj9xK7W9tV5HkuM3GwoNrO4z49QiELrE3YHqQ2mQ3eVkK',
    sessionSecret: 'test-session-secret-that-is-long-enough-for-controlled-tests',
    sessionMaxAgeMs: 60 * 60 * 1000,
    localApiKey: 'test-local-api-key-that-is-long-enough',
    allowedAdminOrigins: ['http://localhost:5173'],
    trustProxy: false,
    rateLimits: {
      login: { windowMs: 60_000, limit: 5 },
      mobileSync: { windowMs: 60_000, limit: 1_000 },
      evidence: { windowMs: 60_000, limit: 1_000 },
      download: { windowMs: 60_000, limit: 1_000 },
      admin: { windowMs: 60_000, limit: 1_000 },
    },
    ...overrides,
  };
}

function resolveProjectPath(value: string | undefined, fallback: string) {
  return path.resolve(projectRoot, value?.trim() || fallback);
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw configurationError(`${name} es obligatorio.`);
  return value;
}

function parseNodeEnvironment(value: string | undefined): ServerEnvironment {
  const normalized = value?.trim() || 'development';
  if (!['development', 'test', 'production', 'local-production'].includes(normalized)) {
    throw configurationError('NODE_ENV no es válido.');
  }
  return normalized as ServerEnvironment;
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
) {
  const parsed = value === undefined || value.trim() === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw configurationError(`${name} debe ser un entero entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function parseNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
) {
  const parsed = value === undefined || value.trim() === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw configurationError(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string
): T {
  const normalized = (value?.trim() || fallback) as T;
  if (!allowed.includes(normalized)) {
    throw configurationError(`${name} debe ser uno de: ${allowed.join(', ')}.`);
  }
  return normalized;
}

function parseOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/') throw new Error();
        return parsed.origin;
      } catch {
        throw configurationError('ALLOWED_ADMIN_ORIGINS contiene un origen inválido.');
      }
    });
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  const normalized = value?.trim() || 'false';
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

function rateLimit(
  environment: NodeJS.ProcessEnv,
  prefix: string,
  defaultWindowMs: number,
  defaultLimit: number
): RateLimitConfig {
  return {
    windowMs: parseInteger(
      environment[`${prefix}_WINDOW_MS`],
      defaultWindowMs,
      1_000,
      24 * 60 * 60_000,
      `${prefix}_WINDOW_MS`
    ),
    limit: parseInteger(
      environment[`${prefix}_MAX`],
      defaultLimit,
      1,
      100_000,
      `${prefix}_MAX`
    ),
  };
}

function looksLikeExample(value: string) {
  const normalized = value.toLocaleLowerCase();
  return exampleMarkers.some((marker) => normalized.includes(marker));
}

function configurationError(message: string) {
  return new Error(`Configuración de seguridad inválida: ${message}`);
}
