import { getDatabase } from '../db';
import { generateId } from '../uuid';
import { Photo } from '../../types/inspection.types';

type AddPhotoInput = Omit<Photo, 'id' | 'created_at'>;

export async function addPhoto(input: AddPhotoInput): Promise<Photo> {
  const db = getDatabase();
  const photo: Photo = {
    id: generateId(),
    ...input,
    created_at: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO photos (id, inspection_id, field_key, local_uri, thumbnail_uri, caption, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      photo.id,
      photo.inspection_id,
      photo.field_key,
      photo.local_uri,
      photo.thumbnail_uri,
      photo.caption,
      photo.created_at,
    ]
  );

  return photo;
}

export async function getPhotosByInspection(inspectionId: string): Promise<Photo[]> {
  const db = getDatabase();
  return db.getAllAsync<Photo>(
    'SELECT * FROM photos WHERE inspection_id = ? ORDER BY created_at ASC',
    [inspectionId]
  );
}

export async function deletePhoto(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM photos WHERE id = ?', [id]);
}

export async function deletePhotosByInspection(inspectionId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM photos WHERE inspection_id = ?', [inspectionId]);
}
