import { getDatabase } from '../db';
import { generateId } from '../uuid';
import { Signature } from '../../types/inspection.types';

type SaveSignatureInput = Omit<Signature, 'id' | 'signed_at'>;

export async function saveSignature(input: SaveSignatureInput): Promise<Signature> {
  const db = getDatabase();
  const signature: Signature = {
    id: generateId(),
    ...input,
    signed_at: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO signatures (id, inspection_id, signer_type, image_base64, signed_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      signature.id,
      signature.inspection_id,
      signature.signer_type,
      signature.image_base64,
      signature.signed_at,
    ]
  );

  return signature;
}

export async function getSignaturesByInspection(inspectionId: string): Promise<Signature[]> {
  const db = getDatabase();
  return db.getAllAsync<Signature>(
    'SELECT * FROM signatures WHERE inspection_id = ? ORDER BY signed_at ASC',
    [inspectionId]
  );
}

export async function deleteSignaturesByInspection(inspectionId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM signatures WHERE inspection_id = ?', [inspectionId]);
}
