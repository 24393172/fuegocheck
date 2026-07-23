import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Level = 'debug' | 'info' | 'warn' | 'error';
const weights: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitive = /authorization|cookie|password|secret|token|api.?key|signature|base64/i;

export class StructuredLogger {
  constructor(
    private readonly directory: string,
    private readonly minimum: Level = 'info',
    private readonly retentionDays = 30
  ) {
    try { fs.mkdirSync(directory, { recursive: true }); } catch { /* stderr fallback */ }
  }

  log(level: Level, event: string, fields: Record<string, unknown> = {}) {
    if (weights[level] < weights[this.minimum]) return;
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...redact(fields),
    });
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      let target = path.join(this.directory, `extincheck-${day}.jsonl`);
      if (fs.existsSync(target) && fs.statSync(target).size > 10 * 1024 * 1024) {
        target = path.join(this.directory, `extincheck-${day}-${Date.now()}.jsonl`);
      }
      fs.appendFileSync(target, `${record}\n`, 'utf8');
    } catch {
      process.stderr.write(`${record}\n`);
    }
  }

  cleanup() {
    if (!fs.existsSync(this.directory)) return 0;
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    let removed = 0;
    for (const entry of fs.readdirSync(this.directory, { withFileTypes: true })) {
      const target = path.join(this.directory, entry.name);
      if (entry.isFile() && entry.name.endsWith('.jsonl') && fs.statSync(target).mtimeMs < cutoff) {
        fs.rmSync(target, { force: true });
        removed += 1;
      }
    }
    return removed;
  }
}

export function requestLogging(logger: StructuredLogger) {
  return (request: Request, response: Response, next: NextFunction) => {
    const candidate = request.header('X-Request-ID') ?? '';
    const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : randomUUID();
    response.setHeader('X-Request-ID', requestId);
    const started = Date.now();
    response.on('finish', () => logger.log(
      response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
      requestEvent(request.method, request.path),
      {
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - started,
        ip: request.ip,
      }
    ));
    next();
  };
}

function requestEvent(method: string, requestPath: string) {
  if (requestPath.endsWith('/auth/login')) return 'admin.login';
  if (requestPath.endsWith('/auth/logout')) return 'admin.logout';
  if (requestPath.includes('/maintenance/backups')) return method === 'POST' ? 'backup.requested' : 'backup.read';
  if (requestPath.includes('/maintenance/audit')) return 'storage.audit';
  if (requestPath.includes('/evidence')) return method === 'DELETE' ? 'evidence.deleted' : method === 'POST' ? 'evidence.uploaded' : 'evidence.read';
  if (requestPath.endsWith('/sync')) return 'inspection.synchronized';
  if (requestPath.includes('/reports') && requestPath.includes('/download')) return 'report.downloaded';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      && /^\/api\/(companies|branches|locations)/.test(requestPath)) return 'admin.catalog.changed';
  return 'http.request';
}

function redact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key,
    sensitive.test(key) ? '[REDACTED]' : typeof value === 'string' && value.length > 2000
      ? `${value.slice(0, 2000)}…` : value,
  ]));
}
