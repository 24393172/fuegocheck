import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

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

  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: parseInteger(environment.PORT, 3001, 1, 65535, 'PORT'),
    databasePath: resolveProjectPath(environment.DATABASE_PATH, './data/extincheck-local.sqlite'),
    templatePath: resolveProjectPath(
      environment.EXTINGUISHERS_TEMPLATE_PATH,
      './templates/FORMATOS P.R. CANCUN.xlsx'
    ),
    generatedReportsPath: resolveProjectPath(environment.GENERATED_REPORTS_PATH, './generated-reports'),
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
  };
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
