import path from 'node:path';

export interface StorageLayout {
  root: string;
  data: string;
  reports: string;
  templates: string;
  signatures: string;
  evidence: string;
  backups: string;
  logs: string;
  temp: string;
}

export function createStorageLayout(input: {
  root: string;
  data?: string;
  reports?: string;
  templates?: string;
  backups?: string;
  logs?: string;
  temp?: string;
}): StorageLayout {
  const root = path.resolve(input.root);
  const data = path.resolve(input.data ?? path.join(root, 'data'));
  return {
    root,
    data,
    reports: path.resolve(input.reports ?? path.join(root, 'generated-reports')),
    templates: path.resolve(input.templates ?? path.join(root, 'templates')),
    signatures: path.join(data, 'signatures'),
    evidence: path.join(data, 'evidence'),
    backups: path.resolve(input.backups ?? path.join(root, 'backups')),
    logs: path.resolve(input.logs ?? path.join(root, 'logs')),
    temp: path.resolve(input.temp ?? path.join(root, 'temp')),
  };
}

export function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isPathInsideAllowedStorage(candidate: string, layout: StorageLayout): boolean {
  return allowedRoots(layout).some((root) => isPathInside(root, candidate));
}

export function toPortableStoredPath(value: string, layout: StorageLayout): string {
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(layout.root, value);
  if (!isPathInsideAllowedStorage(candidate, layout)) {
    throw new Error('La ruta está fuera del almacenamiento permitido.');
  }
  const relative = path.relative(layout.root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('La ruta no puede representarse de forma portable.');
  }
  return relative.split(path.sep).join('/');
}

export function resolveStoredPath(value: string, layout: StorageLayout): string {
  if (!value || value.includes('\0')) throw new Error('Ruta almacenada inválida.');
  const candidate = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(layout.root, value.replaceAll('/', path.sep));
  if (!isPathInsideAllowedStorage(candidate, layout)) {
    throw new Error('La ruta almacenada está fuera del almacenamiento permitido.');
  }
  return candidate;
}

export function validateStorageLayout(layout: StorageLayout): void {
  const sources = [layout.data, layout.reports, layout.templates];
  if (sources.some((source) =>
    isPathInside(source, layout.backups) || isPathInside(layout.backups, source))) {
    throw new Error('BACKUP_DIRECTORY no puede contener ni estar dentro de data, reportes o plantillas.');
  }
  if (isPathInside(layout.temp, layout.backups) || isPathInside(layout.backups, layout.temp)) {
    throw new Error('BACKUP_DIRECTORY y el directorio temporal no pueden contenerse entre sí.');
  }
}

function allowedRoots(layout: StorageLayout): string[] {
  return [
    layout.data,
    layout.reports,
    layout.templates,
    layout.backups,
    layout.logs,
    layout.temp,
  ];
}
