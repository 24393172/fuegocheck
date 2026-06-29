import * as FileSystem from 'expo-file-system/legacy';

// Email attachment files (the Excel and the signature PNGs) are written to
// documentDirectory and must NOT be deleted right after the mail composer
// opens: Gmail re-reads the content URIs in the background when the email is
// actually sent. If the files are already gone, the send fails silently and
// the email gets stuck in drafts (losing those attachments).
//
// Lifecycle instead:
// - Files use deterministic names per inspection, so re-sharing overwrites them.
// - deleteAttachmentFilesForInspection() removes them when the inspection is deleted.
// - cleanupOldAttachmentFiles() runs at app startup and prunes files older than
//   MAX_AGE_MS (by then any pending Gmail send has long finished).

const ATTACHMENT_PATTERN = /^(inspeccion_.*\.xlsx|firma_.*\.png)$/;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export async function cleanupOldAttachmentFiles(): Promise<void> {
  try {
    const dir = FileSystem.documentDirectory;
    if (!dir) return;
    const now = Date.now();
    const names = await FileSystem.readDirectoryAsync(dir);
    for (const name of names) {
      if (!ATTACHMENT_PATTERN.test(name)) continue;
      const info = await FileSystem.getInfoAsync(dir + name);
      // modificationTime is in seconds in the legacy FileSystem API
      if (info.exists && info.modificationTime && now - info.modificationTime * 1000 > MAX_AGE_MS) {
        await FileSystem.deleteAsync(dir + name, { idempotent: true });
      }
    }
  } catch (error) {
    console.error('[attachments] Cleanup of old files failed:', error);
  }
}

export async function deleteAttachmentFilesForInspection(inspectionId: string): Promise<void> {
  try {
    const dir = FileSystem.documentDirectory;
    if (!dir) return;
    // File names embed the first 8 chars of the inspection id (see
    // excel-generator.ts and pdf-preview.tsx).
    const shortId = inspectionId.slice(0, 8);
    const names = await FileSystem.readDirectoryAsync(dir);
    for (const name of names) {
      if (ATTACHMENT_PATTERN.test(name) && name.includes(`_${shortId}.`)) {
        await FileSystem.deleteAsync(dir + name, { idempotent: true });
      }
    }
  } catch (error) {
    console.error('[attachments] Delete for inspection failed:', error);
  }
}
