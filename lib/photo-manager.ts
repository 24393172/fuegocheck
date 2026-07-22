import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export const MAX_PHOTOS_PER_ITEM = 3;
export const MAX_PHOTOS_PER_INSPECTION = 100;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTOS_MAX_SIDE = 1600;
const PHOTOS_THUMB_SIDE = 240;
const PHOTOS_QUALITY = 0.78;

function inspectionPhotoDir(inspectionId: string): string {
  // documentDirectory persists across reboots; cacheDirectory does not
  return `${FileSystem.documentDirectory}inspections/${inspectionId}/photos/`;
}

export async function ensurePhotoDirExists(inspectionId: string): Promise<void> {
  const dir = inspectionPhotoDir(inspectionId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export async function savePhoto(
  inspectionId: string,
  sourceUri: string,
  photoId: string,
  sourceWidth: number,
  sourceHeight: number
): Promise<{ localUri: string; thumbnailUri: string; width: number; height: number; fileSize: number }> {
  await ensurePhotoDirExists(inspectionId);

  const dir = inspectionPhotoDir(inspectionId);
  const fullPath = `${dir}${photoId}.jpg`;
  const thumbPath = `${dir}${photoId}_thumb.jpg`;

  const fullResize = sourceWidth >= sourceHeight
    ? { width: Math.min(sourceWidth, PHOTOS_MAX_SIDE) }
    : { height: Math.min(sourceHeight, PHOTOS_MAX_SIDE) };
  const thumbResize = sourceWidth >= sourceHeight
    ? { width: Math.min(sourceWidth, PHOTOS_THUMB_SIDE) }
    : { height: Math.min(sourceHeight, PHOTOS_THUMB_SIDE) };
  const [full, thumb] = await Promise.all([
    ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: fullResize }],
      { compress: PHOTOS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    ),
    ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: thumbResize }],
      { compress: PHOTOS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    ),
  ]);

  await Promise.all([
    FileSystem.copyAsync({ from: full.uri, to: fullPath }),
    FileSystem.copyAsync({ from: thumb.uri, to: thumbPath }),
  ]);
  const info = await FileSystem.getInfoAsync(fullPath);
  const fileSize = info.exists && typeof info.size === 'number' ? info.size : 0;
  if (!fileSize || fileSize > MAX_PHOTO_BYTES) {
    await deletePhotoFiles(fullPath, thumbPath);
    throw new Error('PHOTO_SIZE_LIMIT');
  }
  return { localUri: fullPath, thumbnailUri: thumbPath, width: full.width, height: full.height, fileSize };
}

export async function deletePhotoFiles(localUri: string, thumbnailUri: string | null): Promise<void> {
  await FileSystem.deleteAsync(localUri, { idempotent: true });
  if (thumbnailUri) {
    await FileSystem.deleteAsync(thumbnailUri, { idempotent: true });
  }
}

export async function deleteAllPhotosForInspection(inspectionId: string): Promise<void> {
  const dir = inspectionPhotoDir(inspectionId);
  await FileSystem.deleteAsync(dir, { idempotent: true });
}
