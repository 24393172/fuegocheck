import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hash } from 'bcryptjs';
import { AdminRepository } from '../src/admin-repository.js';
import { createApp } from '../src/app.js';
import { createTestSecurityConfig, loadConfig, SecurityConfig } from '../src/config.js';
import { LocalDatabase } from '../src/database.js';
import { ExtinguisherReportService } from '../src/report-generator.js';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const templatePath = path.join(serverRoot, 'templates', 'FORMATOS P.R. CANCUN.xlsx');
const adminOrigin = 'http://admin.test';
const mobileApiKey = 'security-test-mobile-api-key-00000001';
const adminPassword = 'correct horse battery staple';

async function secureServer(context: any, overrides: Partial<SecurityConfig> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extincheck-security-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = new LocalDatabase(databasePath);
  const adminRepository = new AdminRepository(databasePath);
  const reportService = new ExtinguisherReportService(database, templatePath, path.join(directory, 'reports'));
  const security = createTestSecurityConfig({
    adminUsername: 'security-admin',
    adminPasswordHash: await hash(adminPassword, 4),
    localApiKey: mobileApiKey,
    allowedAdminOrigins: [adminOrigin],
    ...overrides,
  });
  const server = createApp(
    database,
    reportService,
    adminRepository,
    path.join(serverRoot, 'admin-web', 'dist'),
    security
  ).listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    adminRepository.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    database,
    databasePath,
    adminRepository,
    security,
  };
}

async function adminLogin(baseUrl: string, password = adminPassword) {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: adminOrigin },
    body: JSON.stringify({ username: 'security-admin', password }),
  });
  const body = await response.json() as {
    session?: { username: string; expiresAt: string; csrfToken: string };
    message?: string;
  };
  return {
    response,
    body,
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0] ?? '',
  };
}

function mobileHeaders(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${mobileApiKey}`, ...extra };
}

function securityInspection(inspectionId = 'security-inspection-001') {
  return {
    inspectionId,
    company: { id: null, name: 'Empresa seguridad' },
    date: '2026-07-23',
    technician: { id: null, name: 'Técnico Seguridad' },
    extinguishers: [{
      id: 'security-ext-1', numero: '1', ubicacion: 'Recepción', tipo_extintor: 'PQS',
      capacidad: '6 KG', proxima_recarga: '2027-01', presion: 'si', presion_comentario: '',
      altura: 'si', altura_comentario: '', seguro: 'si', seguro_comentario: '',
      pintura: 'si', pintura_comentario: '', manguera: 'si', manguera_comentario: '',
      difusor: 'na', difusor_comentario: '', senalamiento: 'si',
      senalamiento_comentario: '', observaciones: '', createdAt: 1, updatedAt: 2,
    }],
    syncVersion: 1,
  };
}

test('real configuration refuses missing or example secrets without echoing them', () => {
  const insecure = {
    NODE_ENV: 'production',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD_HASH: '$2b$12$change-me-example-value',
    SESSION_SECRET: 'change-me-example-session-secret-that-is-intentionally-long',
    LOCAL_API_KEY: 'change-me-example-local-api-key-value',
  };
  assert.throws(
    () => loadConfig(insecure),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /configuración de seguridad inválida/i);
      assert.doesNotMatch(message, /intentionally-long|local-api-key-value/);
      return true;
    }
  );
  assert.throws(() => loadConfig({ NODE_ENV: 'local-production' }), /ADMIN_USERNAME/);
});

test('controlled test environment loads valid security configuration', async () => {
  const passwordHash = await hash(adminPassword, 4);
  const config = loadConfig({
    NODE_ENV: 'test',
    ADMIN_USERNAME: 'test-admin',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: 'controlled-session-secret-for-tests-with-more-than-forty-three-characters',
    LOCAL_API_KEY: 'controlled-local-api-key-for-tests',
    SESSION_MAX_AGE_HOURS: '2',
    ALLOWED_ADMIN_ORIGINS: 'http://localhost:5173',
    TRUST_PROXY: 'false',
  });
  assert.equal(config.security.nodeEnv, 'test');
  assert.equal(config.security.sessionMaxAgeMs, 2 * 60 * 60 * 1000);
  assert.deepEqual(config.security.allowedAdminOrigins, ['http://localhost:5173']);
});

test('admin login creates a persistent HTTP-only session and protected CRUD requires it', async (context) => {
  const { baseUrl, databasePath } = await secureServer(context);
  assert.equal((await fetch(`${baseUrl}/api/companies`)).status, 401);

  const wrong = await adminLogin(baseUrl, 'wrong password');
  assert.equal(wrong.response.status, 401);
  assert.equal(wrong.body.message, 'Usuario o contraseña incorrectos.');

  const login = await adminLogin(baseUrl);
  assert.equal(login.response.status, 200);
  assert.ok(login.cookie.startsWith('extincheck_admin_session='));
  const setCookie = login.response.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.ok(login.body.session?.csrfToken);

  const session = await fetch(`${baseUrl}/api/admin/auth/session`, {
    headers: { Cookie: login.cookie },
  });
  assert.equal(session.status, 200);

  const rawToken = decodeURIComponent(login.cookie.split('=')[1]);
  const verifier = new AdminRepository(databasePath);
  assert.ok(verifier.findActiveAdminSession(
    createHmac('sha256', 'test-session-secret-that-is-long-enough-for-controlled-tests')
      .update(rawToken)
      .digest('hex'),
    new Date().toISOString()
  ));
  verifier.close();

  const noCsrf = await fetch(`${baseUrl}/api/companies`, {
    method: 'POST',
    headers: { Cookie: login.cookie, Origin: adminOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Empresa protegida', businessName: '', active: true }),
  });
  assert.equal(noCsrf.status, 403);

  const created = await fetch(`${baseUrl}/api/companies`, {
    method: 'POST',
    headers: {
      Cookie: login.cookie,
      Origin: adminOrigin,
      'Content-Type': 'application/json',
      'X-ExtinCheck-CSRF': login.body.session!.csrfToken,
    },
    body: JSON.stringify({ name: 'Empresa protegida', businessName: '', active: true }),
  });
  assert.equal(created.status, 201);

  const logout = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: login.cookie,
      Origin: adminOrigin,
      'X-ExtinCheck-CSRF': login.body.session!.csrfToken,
    },
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/auth/session`, {
    headers: { Cookie: login.cookie },
  })).status, 401);
});

test('expired admin sessions are ignored', async (context) => {
  const { baseUrl } = await secureServer(context, { sessionMaxAgeMs: 5 });
  const login = await adminLogin(baseUrl);
  assert.equal(login.response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal((await fetch(`${baseUrl}/api/admin/auth/session`, {
    headers: { Cookie: login.cookie },
  })).status, 401);
});

test('admin origin policy allows configured origins and rejects private network origins', async (context) => {
  const { baseUrl } = await secureServer(context);
  const allowed = await fetch(`${baseUrl}/api/health`, { headers: { Origin: adminOrigin } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), adminOrigin);
  assert.equal((await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'http://192.168.1.55:5173' },
  })).status, 403);
});

test('public health is minimal while catalog and sync require the mobile Bearer token', async (context) => {
  const { baseUrl } = await secureServer(context);
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(Object.keys(await health.json()).sort(), ['ok', 'service', 'timestamp', 'version']);

  assert.equal((await fetch(`${baseUrl}/api/mobile/catalog`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/mobile/catalog`, {
    headers: { Authorization: 'Bearer incorrect-token' },
  })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/mobile/catalog`, { headers: mobileHeaders() })).status, 200);

  const body = {
    ...securityInspection(),
    attention: '',
    area: '',
    selectedFormatIds: ['extintores'],
  };
  assert.equal((await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer incorrect-token' },
    body: JSON.stringify(body),
  })).status, 401);
  const synced = await fetch(`${baseUrl}/api/inspections/sync`, {
    method: 'POST',
    headers: mobileHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  assert.equal(synced.status, 201);
  const syncBody = await synced.json() as { report: { downloadUrl: string } };
  assert.match(syncBody.report.downloadUrl, /^\/api\/mobile\/inspections\//);

  assert.equal((await fetch(`${baseUrl}${syncBody.report.downloadUrl}`)).status, 401);
  const download = await fetch(`${baseUrl}${syncBody.report.downloadUrl}`, { headers: mobileHeaders() });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type') ?? '', /spreadsheetml/);

  assert.equal((await fetch(`${baseUrl}/api/inspections/${body.inspectionId}/evidence`, {
    method: 'POST',
  })).status, 401);
});

test('login rate limit blocks excessive attempts without affecting normal health usage', async (context) => {
  const { baseUrl } = await secureServer(context, {
    rateLimits: {
      ...createTestSecurityConfig().rateLimits,
      login: { windowMs: 60_000, limit: 2 },
    },
  });
  assert.equal((await adminLogin(baseUrl, 'wrong-1')).response.status, 401);
  assert.equal((await adminLogin(baseUrl, 'wrong-2')).response.status, 401);
  assert.equal((await adminLogin(baseUrl, 'wrong-3')).response.status, 429);
  assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
});
