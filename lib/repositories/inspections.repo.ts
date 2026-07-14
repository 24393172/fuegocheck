import { getDatabase } from '../db';
import { generateId } from '../uuid';
import { Inspection, InspectionListItem, InspectionStatus, SyncStatus } from '../../types/inspection.types';
import { deleteAllPhotosForInspection } from '../photo-manager';
import { deleteAttachmentFilesForInspection } from '../attachment-files';

type CreateInspectionInput = Omit<
  Inspection,
  'id' | 'pinned' | 'created_at' | 'updated_at' | 'sent_at' |
  'sync_status' | 'last_sync_attempt' | 'synced_at' | 'sync_error'
>;

type InspectionRow = Omit<Inspection, 'pinned'> & { pinned: number };
type InspectionListRow = Omit<InspectionListItem, 'pinned'> & { pinned: number };

function mapInspection(row: InspectionRow): Inspection {
  return { ...row, pinned: row.pinned === 1 };
}

function mapInspectionListItem(row: InspectionListRow): InspectionListItem {
  return { ...row, pinned: row.pinned === 1 };
}

export interface InspectionFilters {
  statuses?: InspectionStatus[];
  clientName?: string;
  createdFrom?: number;
  createdTo?: number;
  limit?: number;
  prioritizePinned?: boolean;
}

export async function createInspection(input: CreateInspectionInput): Promise<Inspection> {
  const db = getDatabase();
  const now = Date.now();
  const inspection: Inspection = {
    id: generateId(),
    ...input,
    pinned: false,
    created_at: now,
    updated_at: now,
    sent_at: null,
    sync_status: 'pending',
    last_sync_attempt: null,
    synced_at: null,
    sync_error: null,
  };

  await db.runAsync(
    `INSERT INTO inspections
      (id, form_type, form_version, technician_name, client_name, location, status, pending_comment, form_data, created_at, updated_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      inspection.id,
      inspection.form_type,
      inspection.form_version,
      inspection.technician_name,
      inspection.client_name,
      inspection.location,
      inspection.status,
      inspection.pending_comment,
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
  const row = await db.getFirstAsync<InspectionRow>('SELECT * FROM inspections WHERE id = ?', [id]);
  return row ? mapInspection(row) : null;
}

// Full records including form_data — only for exports (master Excel).
export async function getAllInspections(): Promise<Inspection[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<InspectionRow>(
    'SELECT * FROM inspections ORDER BY created_at DESC',
    []
  );
  return rows.map(mapInspection);
}

// List screens only need these columns. Skipping form_data (a ~90-field JSON
// blob per row) keeps the dashboard and history fast as inspections accumulate.
export async function getInspectionsForList(limitOrFilters?: number | InspectionFilters): Promise<InspectionListItem[]> {
  const db = getDatabase();
  const filters = typeof limitOrFilters === 'number' ? { limit: limitOrFilters } : (limitOrFilters ?? {});
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.statuses?.length) {
    where.push(`status IN (${filters.statuses.map(() => '?').join(', ')})`);
    params.push(...filters.statuses);
  }
  if (filters.clientName?.trim()) { where.push('client_name LIKE ?'); params.push(`%${filters.clientName.trim()}%`); }
  if (filters.createdFrom !== undefined) { where.push('created_at >= ?'); params.push(filters.createdFrom); }
  if (filters.createdTo !== undefined) { where.push('created_at <= ?'); params.push(filters.createdTo); }
  let sql = `SELECT id, technician_name, client_name, location, status, pending_comment, pinned, created_at, updated_at FROM inspections`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += filters.prioritizePinned
    ? ' ORDER BY pinned DESC, updated_at DESC'
    : ' ORDER BY created_at DESC';
  if (filters.limit !== undefined) { sql += ' LIMIT ?'; params.push(filters.limit); }
  const rows = await db.getAllAsync<InspectionListRow>(sql, params);
  return rows.map(mapInspectionListItem);
}

// Dashboard stats without loading any rows into memory.
export async function getInspectionCounts(): Promise<Record<InspectionStatus, number>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ status: InspectionStatus; count: number }>(
    'SELECT status, COUNT(*) as count FROM inspections GROUP BY status',
    []
  );
  const counts: Record<InspectionStatus, number> = { draft: 0, pending: 0, completed: 0, sent: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status] = row.count;
  }
  return counts;
}

export async function updateInspection(
  id: string,
  fields: Partial<Omit<Inspection, 'id' | 'created_at'>>
): Promise<void> {
  const db = getDatabase();
  const updates: Partial<Omit<Inspection, 'id' | 'created_at'>> & { updated_at: number } = {
    ...fields,
    updated_at: Date.now(),
  };
  if (fields.form_data !== undefined) {
    updates.sync_status = 'pending';
    updates.synced_at = null;
    updates.sync_error = null;
  }
  const columns = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];

  await db.runAsync(`UPDATE inspections SET ${columns} WHERE id = ?`, values);
}

export async function updateStatus(id: string, status: InspectionStatus, pendingComment?: string): Promise<void> {
  const db = getDatabase();
  const now = Date.now();
  const sent_at = status === 'sent' ? now : null;

  const comment = pendingComment?.trim() ?? '';
  if (status === 'pending' && !comment) throw new Error('PENDING_COMMENT_REQUIRED');
  await db.runAsync(
    `UPDATE inspections
     SET status = ?, pending_comment = ?, updated_at = ?, sent_at = ?,
         pinned = CASE WHEN ? IN ('draft', 'pending') THEN pinned ELSE 0 END
     WHERE id = ?`,
    [status, status === 'pending' ? comment : null, now, sent_at, status, id]
  );
}

export async function updateSyncState(
  id: string,
  status: SyncStatus,
  errorMessage: string | null = null
): Promise<void> {
  const db = getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE inspections
     SET sync_status = ?,
         last_sync_attempt = ?,
         synced_at = CASE WHEN ? = 'synced' THEN ? ELSE synced_at END,
         sync_error = ?
     WHERE id = ?`,
    [status, now, status, now, status === 'error' ? errorMessage?.slice(0, 1000) ?? 'Unknown sync error' : null, id]
  );
}

export async function setInspectionPinned(id: string, pinned: boolean): Promise<void> {
  const db = getDatabase();
  const result = await db.runAsync(
    `UPDATE inspections SET pinned = ?
     WHERE id = ? AND status IN ('draft', 'pending')`,
    [pinned ? 1 : 0, id]
  );
  if (result.changes !== 1) throw new Error('EDITABLE_INSPECTION_NOT_FOUND');
}

export async function deleteInspection(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM inspections WHERE id = ?', [id]);
}

// Deletes an inspection and everything attached to it: photo rows, signature
// rows, the inspection row, and the physical photo files on disk. Use this
// instead of deleteInspection() to avoid orphaned rows and leftover files.
export async function deleteInspectionCompletely(
  id: string,
  requiredStatus?: InspectionStatus
): Promise<void> {
  const db = getDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (requiredStatus) {
      const row = await transaction.getFirstAsync<{ status: InspectionStatus }>(
        'SELECT status FROM inspections WHERE id = ?',
        [id]
      );
      if (!row || row.status !== requiredStatus) {
        throw new Error('INSPECTION_STATUS_CHANGED');
      }
    }
    await transaction.runAsync('DELETE FROM photos WHERE inspection_id = ?', [id]);
    await transaction.runAsync('DELETE FROM signatures WHERE inspection_id = ?', [id]);
    await transaction.runAsync('DELETE FROM inspections WHERE id = ?', [id]);
  });
  // Physical files are best-effort — a failure here shouldn't block the delete.
  await deleteAllPhotosForInspection(id).catch((error) =>
    console.error('[inspections.repo] Could not delete photo files:', error)
  );
  // Shared email files (Excel + signature PNGs) persist after sharing so Gmail
  // can finish sending; remove them when the inspection goes away.
  await deleteAttachmentFilesForInspection(id).catch((error) =>
    console.error('[inspections.repo] Could not delete attachment files:', error)
  );
}
