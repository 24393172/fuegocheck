import { getDatabase } from '../db';
import { generateId } from '../uuid';
import { Photo } from '../../types/inspection.types';

type PhotoRow = Omit<Photo, 'is_deleted' | 'legacy'> & { is_deleted: number; legacy: number };
type AddPhotoInput = Pick<Photo, 'inspection_id' | 'field_key' | 'local_uri' | 'thumbnail_uri' |
  'caption' | 'format_type' | 'form_type' | 'item_id' | 'location_name_snapshot'> & { id?: string; legacy?: boolean };

function fromRow(row: PhotoRow): Photo {
  return { ...row, is_deleted: row.is_deleted === 1, legacy: row.legacy === 1 };
}

async function markInspectionEvidencePending(inspectionId: string): Promise<void> {
  await getDatabase().runAsync(`UPDATE inspections SET
    sync_status = CASE WHEN synced_at IS NULL THEN 'pending' ELSE 'partial' END,
    sync_error = 'Hay fotografías pendientes de sincronizar.',
    official_report_id = NULL, official_report_filename = NULL,
    official_report_download_url = NULL WHERE id = ?`, [inspectionId]);
}

export async function addPhoto(input: AddPhotoInput): Promise<Photo> {
  const db = getDatabase();
  const now = Date.now();
  const photo: Photo = {
    id: input.id ?? generateId(), inspection_id: input.inspection_id, field_key: input.field_key,
    local_uri: input.local_uri, thumbnail_uri: input.thumbnail_uri, caption: input.caption,
    format_type: input.format_type, form_type: input.form_type, item_id: input.item_id,
    location_name_snapshot: input.location_name_snapshot, created_at: now, updated_at: now,
    sync_status: 'pending', synced_at: null, last_sync_attempt: null, sync_error: null,
    server_evidence_id: null, is_deleted: false, legacy: input.legacy ?? false,
  };
  await db.runAsync(`INSERT INTO photos (
    id, inspection_id, field_key, local_uri, thumbnail_uri, caption, created_at, updated_at,
    format_type, form_type, item_id, location_name_snapshot, sync_status, synced_at, last_sync_attempt,
    sync_error, server_evidence_id, is_deleted, legacy
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`, [
    photo.id, photo.inspection_id, photo.field_key, photo.local_uri, photo.thumbnail_uri,
    photo.caption, photo.created_at, photo.updated_at, photo.format_type, photo.form_type, photo.item_id,
    photo.location_name_snapshot, photo.sync_status, photo.synced_at, photo.last_sync_attempt,
    photo.sync_error, photo.server_evidence_id, photo.legacy ? 1 : 0,
  ]);
  await markInspectionEvidencePending(photo.inspection_id);
  return photo;
}

export async function getPhotosByInspection(inspectionId: string, includeDeleted = false): Promise<Photo[]> {
  const rows = await getDatabase().getAllAsync<PhotoRow>(
    `SELECT * FROM photos WHERE inspection_id = ? ${includeDeleted ? '' : 'AND is_deleted = 0'} ORDER BY created_at ASC`,
    [inspectionId]
  );
  return rows.map(fromRow);
}

export async function getPhotosForItem(inspectionId: string, formatType: string, itemId: string): Promise<Photo[]> {
  const rows = await getDatabase().getAllAsync<PhotoRow>(
    `SELECT * FROM photos WHERE inspection_id = ? AND format_type = ? AND item_id = ?
     AND is_deleted = 0 ORDER BY created_at ASC`, [inspectionId, formatType, itemId]
  );
  return rows.map(fromRow);
}

export async function updatePhotoCaption(id: string, caption: string | null): Promise<void> {
  const db = getDatabase();
  const photo = await db.getFirstAsync<{ inspection_id: string }>('SELECT inspection_id FROM photos WHERE id = ?', [id]);
  await db.runAsync(`UPDATE photos SET caption = ?, updated_at = ?, sync_status = 'pending',
    sync_error = NULL WHERE id = ?`, [caption, Date.now(), id]);
  if (photo) await markInspectionEvidencePending(photo.inspection_id);
}

export async function markPhotoUploading(id: string): Promise<void> {
  await getDatabase().runAsync(`UPDATE photos SET sync_status = 'uploading', last_sync_attempt = ?,
    sync_error = NULL WHERE id = ?`, [Date.now(), id]);
}

export async function markPhotoSynced(id: string, serverEvidenceId: string): Promise<void> {
  const now = Date.now();
  await getDatabase().runAsync(`UPDATE photos SET sync_status = 'synced', synced_at = ?,
    last_sync_attempt = ?, sync_error = NULL, server_evidence_id = ? WHERE id = ?`,
  [now, now, serverEvidenceId, id]);
}

export async function markPhotoError(id: string, message: string): Promise<void> {
  await getDatabase().runAsync(`UPDATE photos SET sync_status = 'error', last_sync_attempt = ?,
    sync_error = ? WHERE id = ?`, [Date.now(), message.slice(0, 500), id]);
}

export async function requestPhotoDeletion(photo: Photo): Promise<'pending_server' | 'deleted_local'> {
  const db = getDatabase();
  if (photo.server_evidence_id || photo.sync_status === 'synced') {
    await db.runAsync(`UPDATE photos SET is_deleted = 1, sync_status = 'pending',
      updated_at = ?, sync_error = NULL WHERE id = ?`, [Date.now(), photo.id]);
    await markInspectionEvidencePending(photo.inspection_id);
    return 'pending_server';
  }
  await db.runAsync('DELETE FROM photos WHERE id = ?', [photo.id]);
  await markInspectionEvidencePending(photo.inspection_id);
  return 'deleted_local';
}

export async function deletePhoto(id: string): Promise<void> {
  await getDatabase().runAsync('DELETE FROM photos WHERE id = ?', [id]);
}

export async function deletePhotosByInspection(inspectionId: string): Promise<void> {
  await getDatabase().runAsync('DELETE FROM photos WHERE inspection_id = ?', [inspectionId]);
}
