import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const PHOTOS_FULL_WIDTH = 800;
const PHOTOS_THUMB_WIDTH = 200;
const PHOTOS_QUALITY = 0.7;

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
  photoId: string
): Promise<{ localUri: string; thumbnailUri: string }> {
  await ensurePhotoDirExists(inspectionId);

  const dir = inspectionPhotoDir(inspectionId);
  const fullPath = `${dir}${photoId}.jpg`;
  const thumbPath = `${dir}${photoId}_thumb.jpg`;

  const [full, thumb] = await Promise.all([
    ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: PHOTOS_FULL_WIDTH } }],
      { compress: PHOTOS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    ),
    ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: PHOTOS_THUMB_WIDTH } }],
      { compress: PHOTOS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    ),
  ]);

  await Promise.all([
    FileSystem.copyAsync({ from: full.uri, to: fullPath }),
    FileSystem.copyAsync({ from: thumb.uri, to: thumbPath }),
  ]);

  return { localUri: fullPath, thumbnailUri: thumbPath };
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
