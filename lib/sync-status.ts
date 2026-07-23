import { SyncStatus } from '../types/inspection.types';

export const SUPPORTED_SERVER_FORMAT_IDS = ['extintores', 'hidrantes', 'fire_pumps'] as const;

export function resolveSyncOutcome(selectedFormatIds: string[], syncedFormatIds: string[]): {
  status: Extract<SyncStatus, 'partial' | 'synced'>;
  unsupportedFormatIds: string[];
  message: string | null;
} {
  const synced = new Set(syncedFormatIds);
  const unsupportedFormatIds = selectedFormatIds.filter((id) => {
    if (['jockey', 'electrica', 'diesel'].includes(id)) return !synced.has('fire_pumps');
    return !synced.has(id);
  });
  const uniqueUnsupported = unsupportedFormatIds.some(
    (id) => ['jockey', 'electrica', 'diesel'].includes(id)
  )
    ? [
      ...unsupportedFormatIds.filter((id) => !['jockey', 'electrica', 'diesel'].includes(id)),
      'Bombas',
    ]
    : unsupportedFormatIds;
  return uniqueUnsupported.length
    ? {
      status: 'partial',
      unsupportedFormatIds: uniqueUnsupported,
      message: `Sincronización parcial. No se pudieron sincronizar: ${uniqueUnsupported.join(', ')}.`,
    }
    : { status: 'synced', unsupportedFormatIds: [], message: null };
}
