import { SyncStatus } from '../types/inspection.types';

export const SUPPORTED_SERVER_FORMAT_IDS = ['extintores', 'hidrantes', 'fire_pumps', 'alarms', 'ansul_r102'] as const;

export function resolveSyncOutcome(selectedFormatIds: string[], syncedFormatIds: string[]): {
  status: Extract<SyncStatus, 'partial' | 'synced'>;
  unsupportedFormatIds: string[];
  message: string | null;
} {
  const synced = new Set(syncedFormatIds);
  const unsupportedFormatIds = selectedFormatIds.filter((id) => {
    if (['jockey', 'electrica', 'diesel'].includes(id)) return !synced.has('fire_pumps');
    if (['tablero_ad', 'dispositivos_ad', 'dispositivos_convencionales', 'dispositivos_notificacion'].includes(id)) {
      return !synced.has('alarms');
    }
    return !synced.has(id);
  });
  let uniqueUnsupported = unsupportedFormatIds.some(
    (id) => ['jockey', 'electrica', 'diesel'].includes(id)
  )
    ? [
      ...unsupportedFormatIds.filter((id) => !['jockey', 'electrica', 'diesel'].includes(id)),
      'Bombas',
    ]
    : unsupportedFormatIds;
  if (uniqueUnsupported.some((id) =>
    ['tablero_ad', 'dispositivos_ad', 'dispositivos_convencionales', 'dispositivos_notificacion'].includes(id)
  )) {
    uniqueUnsupported = [
      ...uniqueUnsupported.filter((id) =>
        !['tablero_ad', 'dispositivos_ad', 'dispositivos_convencionales', 'dispositivos_notificacion'].includes(id)
      ),
      'Alarmas',
    ];
  }
  return uniqueUnsupported.length
    ? {
      status: 'partial',
      unsupportedFormatIds: uniqueUnsupported,
      message: `Sincronización parcial. No se pudieron sincronizar: ${uniqueUnsupported.join(', ')}.`,
    }
    : { status: 'synced', unsupportedFormatIds: [], message: null };
}
