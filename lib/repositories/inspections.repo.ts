import { getDatabase } from '../db';
import { generateId } from '../uuid';
import { Inspection, InspectionStatus } from '../../types/inspection.types';
import { deletePhotosByInspection } from './photos.repo';
import { deleteSignaturesByInspection } from './signatures.repo';
import { deleteAllPhotosForInspection } from '../photo-manager';

type CreateInspectionInput = Omit<Inspection, 'id' | 'created_at' | 'updated_at' | 'sent_at'>;

export async function createInspection(input: CreateInspectionInput): Promise<Inspection> {
  const db = getDatabase();
  const now = Date.now();
  const inspection: Inspection = {
    id: generateId(),
    ...input,
    created_at: now,
    updated_at: now,
    sent_at: null,
  };

  await db.runAsync(
    `INSERT INTO inspections
      (id, form_type, form_version, technician_name, client_name, location, status, form_data, created_at, updated_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      inspection.id,
      inspection.form_type,
      inspection.form_version,
      inspection.technician_name,
      inspection.client_name,
      inspection.location,
      inspection.status,
      inspection.form_data,
      inspection.created_at,
      inspection.updated_at,
      inspection.sent_at,
    ]
  );

  return inspection;
}

export async function getInspection(id: string): Promise<Inspection | null> {
  const db = getDatabase();
  return db.getFirstAsync<Inspection>('SELECT * FROM inspections WHERE id = ?', [id]);
}

export async function getAllInspections(): Promise<Inspection[]> {
  const db = getDatabase();
  return db.getAllAsync<Inspection>('SELECT * FROM inspections ORDER BY created_at DESC', []);
}

export async function updateInspection(
  id: string,
  fields: Partial<Omit<Inspection, 'id' | 'created_at'>>
): Promise<void> {
  const db = getDatabase();
  const updates = { ...fields, updated_at: Date.now() };
  const columns = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];

  await db.runAsync(`UPDATE inspections SET ${columns} WHERE id = ?`, values);
}

export async function updateStatus(id: string, status: InspectionStatus): Promise<void> {
  const db = getDatabase();
  const now = Date.now();
  const sent_at = status === 'sent' ? now : null;

  await db.runAsync(
    'UPDATE inspections SET status = ?, updated_at = ?, sent_at = ? WHERE id = ?',
    [status, now, sent_at, id]
  );
}

export async function deleteInspection(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM inspections WHERE id = ?', [id]);
}

// Deletes an inspection and everything attached to it: photo rows, signature
// rows, the inspection row, and the physical photo files on disk. Use this
// instead of deleteInspection() to avoid orphaned rows and leftover files.
export async function deleteInspectionCompletely(id: string): Promise<void> {
  await deletePhotosByInspection(id);
  await deleteSignaturesByInspection(id);
  await deleteInspection(id);
  // Physical files are best-effort — a failure here shouldn't block the delete.
  await deleteAllPhotosForInspection(id).catch((error) =>
    console.error('[inspections.repo] Could not delete photo files:', error)
  );
}
