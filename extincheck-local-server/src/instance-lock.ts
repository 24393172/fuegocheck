import fs from 'node:fs';
import path from 'node:path';

const LOCK_NAME = '.extincheck-server.lock';

export class ServerInstanceLock {
  private descriptor: number | null = null;
  readonly filePath: string;

  constructor(dataDirectory: string) {
    this.filePath = path.join(dataDirectory, LOCK_NAME);
  }

  acquire() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    clearStaleLock(this.filePath);
    try {
      this.descriptor = fs.openSync(this.filePath, 'wx');
      fs.writeFileSync(this.descriptor, JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }));
    } catch (error) {
      throw new Error('Ya existe una instancia activa del servidor local.', { cause: error });
    }
  }

  release() {
    if (this.descriptor !== null) {
      fs.closeSync(this.descriptor);
      this.descriptor = null;
    }
    fs.rmSync(this.filePath, { force: true });
  }
}

export function assertServerStopped(dataDirectory: string) {
  const filePath = path.join(dataDirectory, LOCK_NAME);
  clearStaleLock(filePath);
  if (fs.existsSync(filePath)) {
    throw new Error('Detén el servidor ExtinCheck antes de aplicar una restauración.');
  }
}

function clearStaleLock(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { pid?: number };
    if (parsed.pid && processIsRunning(parsed.pid)) return;
  } catch {
    const age = Date.now() - fs.statSync(filePath).mtimeMs;
    if (age < 5 * 60_000) return;
  }
  fs.rmSync(filePath, { force: true });
}

function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
