import { SyncStatus } from '../types/inspection.types';

export const SUPPORTED_SERVER_FORMAT_IDS = ['extintores', 'hidrantes'] as const;

export function resolveSyncOutcome(selectedFormatIds: string[], syncedFormatIds: string[]): {
  status: Extract<SyncStatus, 'partial' | 'synced'>;
  unsupportedFormatIds: string[];
  message: string | null;
} {
  const synced = new Set(syncedFormatIds);
  const unsupportedFormatIds = selectedFormatIds.filter((id) => !synced.has(id));
  return unsupportedFormatIds.length
    ? {
      status: 'partial',
      unsupportedFormatIds,
      message: `Sincronización parcial. Formatos aún no compatibles: ${unsupportedFormatIds.join(', ')}.`,
    }
    : { status: 'synced', unsupportedFormatIds: [], message: null };
}
