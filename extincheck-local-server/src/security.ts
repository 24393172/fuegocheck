import { compare as comparePassword } from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { AdminRepository, AdminSession } from './admin-repository.js';
import { RateLimitConfig, SecurityConfig } from './config.js';

const SESSION_COOKIE = 'extincheck_admin_session';
const CSRF_HEADER = 'x-extincheck-csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface AuthenticatedRequest extends Request {
  adminSession?: AdminSession;
  rawSessionToken?: string;
}

export class CorsOriginError extends Error {}

export function createSecurity(repository: AdminRepository, config: SecurityConfig) {
  const requireAdminSession: RequestHandler = (request, response, next) => {
    if (config.bypassAuthenticationForTests) {
      next();
      return;
    }
    const token = cookieValue(request.headers.cookie, SESSION_COOKIE);
    if (!token) {
      unauthorized(response);
      return;
    }
    const session = repository.findActiveAdminSession(
      hashToken(token, config.sessionSecret),
      new Date().toISOString()
    );
    if (!session) {
      clearSessionCookie(response, request, config);
      unauthorized(response);
      return;
    }
    repository.touchAdminSession(session.id, new Date().toISOString());
    (request as AuthenticatedRequest).adminSession = session;
    (request as AuthenticatedRequest).rawSessionToken = token;
    next();
  };

  const requireAdminCsrf: RequestHandler = (request, response, next) => {
    if (config.bypassAuthenticationForTests || SAFE_METHODS.has(request.method)) {
      next();
      return;
    }
    if (!isAllowedAdminOrigin(request, config.allowedAdminOrigins)) {
      response.status(403).json({ ok: false, message: 'Solicitud administrativa no permitida.' });
      return;
    }
    const token = (request as AuthenticatedRequest).rawSessionToken;
    const csrf = request.get(CSRF_HEADER);
    if (!token || !csrf || !safeEqual(csrf, csrfToken(token, config.sessionSecret))) {
      response.status(403).json({ ok: false, message: 'La validación de seguridad de la solicitud falló.' });
      return;
    }
    next();
  };

  const requireMobileToken: RequestHandler = (request, response, next) => {
    if (config.bypassAuthenticationForTests) {
      next();
      return;
    }
    const authorization = request.get('authorization');
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
    if (!match || !safeEqualHash(match[1], config.localApiKey)) {
      unauthorized(response);
      return;
    }
    next();
  };

  const authRouter = Router();
  const loginLimit = createRateLimit(config.rateLimits.login, 'login');

  authRouter.post('/login', loginLimit, async (request, response) => {
    if (!isAllowedAdminOrigin(request, config.allowedAdminOrigins)) {
      response.status(403).json({ ok: false, message: 'Solicitud administrativa no permitida.' });
      return;
    }
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const usernameMatches = safeEqual(username, config.adminUsername);
    const passwordMatches = password.length > 0
      ? await comparePassword(password, config.adminPasswordHash).catch(() => false)
      : false;
    if (!usernameMatches || !passwordMatches) {
      response.status(401).json({ ok: false, message: 'Usuario o contraseña incorrectos.' });
      return;
    }

    const previous = cookieValue(request.headers.cookie, SESSION_COOKIE);
    if (previous) {
      repository.revokeAdminSession(
        hashToken(previous, config.sessionSecret),
        new Date().toISOString()
      );
    }
    repository.deleteExpiredAdminSessions(new Date().toISOString());
    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.sessionMaxAgeMs);
    repository.createAdminSession({
      id: randomUUID(),
      sessionTokenHash: hashToken(rawToken, config.sessionSecret),
      username: config.adminUsername,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: now.toISOString(),
    });
    response.cookie(SESSION_COOKIE, rawToken, cookieOptions(request, config, expiresAt));
    response.json({
      ok: true,
      session: {
        username: config.adminUsername,
        expiresAt: expiresAt.toISOString(),
        csrfToken: csrfToken(rawToken, config.sessionSecret),
      },
    });
  });

  authRouter.get('/session', requireAdminSession, (request, response) => {
    if (config.bypassAuthenticationForTests) {
      response.json({ ok: true, session: { username: config.adminUsername, expiresAt: null, csrfToken: '' } });
      return;
    }
    const authenticated = request as AuthenticatedRequest;
    response.json({
      ok: true,
      session: {
        username: authenticated.adminSession!.username,
        expiresAt: authenticated.adminSession!.expires_at,
        csrfToken: csrfToken(authenticated.rawSessionToken!, config.sessionSecret),
      },
    });
  });

  authRouter.post('/logout', requireAdminSession, requireAdminCsrf, (request, response) => {
    const token = (request as AuthenticatedRequest).rawSessionToken;
    if (token) {
      repository.revokeAdminSession(
        hashToken(token, config.sessionSecret),
        new Date().toISOString()
      );
    }
    clearSessionCookie(response, request, config);
    response.json({ ok: true });
  });

  return {
    authRouter,
    requireAdminSession,
    requireAdminCsrf,
    requireMobileToken,
    adminRateLimit: createRateLimit(config.rateLimits.admin, 'admin'),
    syncRateLimit: createRateLimit(config.rateLimits.mobileSync, 'mobile-sync'),
    evidenceRateLimit: createRateLimit(config.rateLimits.evidence, 'evidence'),
    downloadRateLimit: createRateLimit(config.rateLimits.download, 'download'),
  };
}

export function corsOriginAllowed(request: Request, allowedOrigins: string[]) {
  const origin = request.get('origin');
  if (!origin) return true;
  return sameOrigin(request, origin) || allowedOrigins.includes(normalizeOrigin(origin));
}

export function createRateLimit(config: RateLimitConfig, scope: string): RequestHandler {
  const attempts = new Map<string, { startedAt: number; count: number }>();
  return (request, response, next) => {
    const now = Date.now();
    const key = `${scope}:${request.ip || request.socket.remoteAddress || 'unknown'}`;
    const current = attempts.get(key);
    const entry = !current || now - current.startedAt >= config.windowMs
      ? { startedAt: now, count: 1 }
      : { ...current, count: current.count + 1 };
    attempts.set(key, entry);
    if (entry.count > config.limit) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((entry.startedAt + config.windowMs - now) / 1000))));
      response.status(429).json({ ok: false, message: 'Demasiadas solicitudes. Inténtalo más tarde.' });
      return;
    }
    next();
  };
}

function isAllowedAdminOrigin(request: Request, allowedOrigins: string[]) {
  const origin = request.get('origin');
  if (origin) return sameOrigin(request, origin) || allowedOrigins.includes(normalizeOrigin(origin));
  const referer = request.get('referer');
  if (!referer) return false;
  return sameOrigin(request, referer) || allowedOrigins.includes(normalizeOrigin(referer));
}

function sameOrigin(request: Request, value: string) {
  try {
    const origin = new URL(value);
    return origin.host === request.get('host') && origin.protocol === `${request.protocol}:`;
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function hashToken(token: string, secret: string) {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function csrfToken(sessionToken: string, secret: string) {
  return createHmac('sha256', secret).update(sessionToken).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeEqualHash(left: string, right: string) {
  return timingSafeEqual(
    createHash('sha256').update(left).digest(),
    createHash('sha256').update(right).digest()
  );
}

function cookieValue(header: string | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function cookieOptions(request: Request, config: SecurityConfig, expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: request.secure,
    path: '/',
    expires,
    maxAge: config.sessionMaxAgeMs,
  };
}

function clearSessionCookie(response: Response, request: Request, config: SecurityConfig) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: request.secure,
    path: '/',
  });
}

function unauthorized(response: Response) {
  response.status(401).json({ ok: false, message: 'Autenticación requerida.' });
}
