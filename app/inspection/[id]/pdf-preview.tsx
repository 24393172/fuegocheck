import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getInspection,
  updateStatus,
  deleteInspectionCompletely,
} from '../../../lib/repositories/inspections.repo';
import { getPhotosByInspection } from '../../../lib/repositories/photos.repo';
import { getSignaturesByInspection } from '../../../lib/repositories/signatures.repo';
import { generateInspectionExcel } from '../../../lib/excel-generator';
import { EMAIL_CONFIG } from '../../../constants/config';
import { getSchema } from '../../../schemas';
import { Inspection, Photo, Signature } from '../../../types/inspection.types';
import StatusBadge from '../../../components/ui/StatusBadge';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Saves a base64 signature string to a local PNG file. Returns the file path. */
async function saveSignatureFile(base64: string, fileName: string): Promise<string> {
  const clean = base64.replace(/^data:image\/\w+;base64,/, '');
  const path = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, clean, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

/** Builds the HTML body: form summary + signature images at the bottom. */
function buildEmailBody(inspection: Inspection, signatures: Signature[]): string {
  const schema = getSchema(inspection.form_type, inspection.form_version);
  const formData = JSON.parse(inspection.form_data) as Record<string, unknown>;
  const date = String(formData['fecha'] ?? formData['inspection_date'] ?? '');
  const technician = inspection.technician_name;

  const SKIP_SECTIONS = new Set(['firmas', 'firma', 'evidencia_fotografica']);
  let sectionsHtml = '';

  if (schema) {
    for (const section of schema.sections) {
      if (SKIP_SECTIONS.has(section.id)) continue;
      let rows = '';
      for (const field of section.fields) {
        if (field.type === 'photo' || field.type === 'signature') continue;
        const raw = formData[field.key];
        const val =
          raw === 'si' ? '✓ Sí' :
          raw === 'no' ? '✗ No' :
          raw === 'na' ? 'N/A' :
          raw != null && raw !== '' ? String(raw) : '—';
        rows += `<tr><td style="padding:5px 10px;color:#374151;width:70%;">${field.label}</td>
                     <td style="padding:5px 10px;text-align:right;">${val}</td></tr>`;
        const comment = formData[field.key + '_comentario'];
        if (comment) rows += `<tr><td colspan="2" style="padding:2px 10px 6px 20px;color:#6b7280;font-size:12px;">↳ ${String(comment)}</td></tr>`;
      }
      if (rows) sectionsHtml += `
        <tr><td colspan="2" style="background:#374151;color:#fff;font-size:11px;font-weight:bold;
          text-transform:uppercase;padding:5px 10px;">${section.title}</td></tr>${rows}`;
    }
  }

  let sigHtml = '';
  for (const sig of signatures) {
    const label = sig.signer_type === 'technician' ? 'Firma del Técnico' : 'Firma del Cliente';
    sigHtml += `<div style="display:inline-block;text-align:center;margin:8px 16px 8px 0;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 4px;">${label}</p>
      <img src="${sig.image_base64}" style="max-width:200px;border:1px solid #d1d5db;border-radius:4px;" />
    </div>`;
  }

  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
    <div style="background:#1e3a5f;color:#fff;padding:16px 20px;border-radius:6px 6px 0 0;">
      <h2 style="margin:0;font-size:18px;">Fuego &amp; Seguridad</h2>
      <p style="margin:4px 0 0;opacity:0.8;font-size:13px;">${schema?.name ?? ''}</p>
    </div>
    <div style="background:#f3f4f6;padding:12px 20px;">
      <b>Cliente:</b> ${inspection.client_name} &nbsp;|&nbsp;
      <b>Fecha:</b> ${date} &nbsp;|&nbsp;
      <b>Técnico:</b> ${technician} &nbsp;|&nbsp;
      <b>Ubicación:</b> ${inspection.location}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">${sectionsHtml}</table>
    ${sigHtml ? `<div style="margin-top:16px;padding:12px 20px;border-top:1px solid #e5e7eb;">
      <p style="font-size:13px;font-weight:bold;color:#374151;margin:0 0 8px;">Firmas</p>
      ${sigHtml}
    </div>` : ''}
    <p style="font-size:10px;color:#9ca3af;text-align:center;padding:12px;">
      Generado automáticamente — Fuego &amp; Seguridad
    </p>
  </div>`;
}

function inspectionDate(inspection: Inspection): string {
  const formData = JSON.parse(inspection.form_data) as Record<string, unknown>;
  return String(formData['fecha'] ?? formData['inspection_date'] ?? '');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [insp, ph, sig] = await Promise.all([
          getInspection(id),
          getPhotosByInspection(id),
          getSignaturesByInspection(id),
        ]);
        if (cancelled) return;
        if (!insp) {
          Alert.alert('Error', 'No se encontró la inspección.');
          router.back();
          return;
        }
        setInspection(insp);
        setPhotos(ph);
        setSignatures(sig);
      } catch (error) {
        console.error('[share] Failed to load inspection:', error);
        Alert.alert('Error', 'No se pudo cargar la inspección.');
        router.back();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  // Builds the Excel + signature files, opens the mail composer, then cleans up
  // the temporary files it created (the Excel and signature PNGs).
  async function shareByEmail(): Promise<void> {
    if (!inspection) return;

    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      Alert.alert(
        'No hay app de correo',
        'Este dispositivo no tiene una app de correo configurada (Gmail, Outlook, etc.). Instala una y vuelve a intentarlo.'
      );
      return;
    }

    const tempFiles: string[] = [];
    try {
      setIsSharing(true);

      // 1. Generate Excel
      const excelPath = await generateInspectionExcel(id);
      tempFiles.push(excelPath);

      // 2. Save signatures as PNG files so they can be attached
      const sigPaths: string[] = [];
      for (const sig of signatures) {
        const path = await saveSignatureFile(
          sig.image_base64,
          `firma_${sig.signer_type}_${id.slice(0, 8)}.png`
        );
        sigPaths.push(path);
        tempFiles.push(path);
      }

      // 3. Attachments: Excel + photos + signatures (photos are NOT temp files)
      const attachments = [excelPath, ...photos.map((p) => p.local_uri), ...sigPaths];

      const subject = `[Inspección] ${inspection.client_name} - ${inspectionDate(inspection)} - ${inspection.technician_name}`;
      const bodyHtml = buildEmailBody(inspection, signatures);

      // 4. Mark as sent before opening the composer. Android mail apps don't
      // reliably report back whether the email was actually sent, so we mark it
      // optimistically — the user can re-share from here if they cancel.
      await updateStatus(id, 'sent');
      setInspection({ ...inspection, status: 'sent' });

      await MailComposer.composeAsync({
        recipients: [EMAIL_CONFIG.recipientEmail],
        subject,
        body: bodyHtml,
        isHtml: true,
        attachments,
      });
    } catch (error) {
      console.error('[share] Failed to share inspection:', error);
      Alert.alert('Error', 'No se pudo preparar el correo. Intenta de nuevo.');
    } finally {
      // Clean up temp files (Excel + signature PNGs). Photos stay on disk.
      for (const file of tempFiles) {
        FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
      }
      setIsSharing(false);
    }
  }

  function confirmShare(): void {
    if (!inspection) return;
    Alert.alert(
      'Compartir por correo',
      `Se abrirá tu app de correo con el Excel y las fotos adjuntas para enviar a:\n\n${EMAIL_CONFIG.recipientEmail}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => { shareByEmail().catch(console.error); } },
      ]
    );
  }

  function confirmDelete(): void {
    Alert.alert(
      'Eliminar inspección',
      '¿Seguro que deseas eliminar esta inspección? Se borrarán sus fotos y firmas. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInspectionCompletely(id);
              router.dismissAll();
            } catch (error) {
              console.error('[share] Failed to delete inspection:', error);
              Alert.alert('Error', 'No se pudo eliminar la inspección.');
            }
          },
        },
      ]
    );
  }

  if (isLoading || !inspection) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.clientName}>{inspection.client_name || 'Sin cliente'}</Text>
          <StatusBadge status={inspection.status} />
        </View>

        <InfoRow label="Fecha" value={inspectionDate(inspection) || '—'} />
        <InfoRow label="Técnico" value={inspection.technician_name || '—'} />
        <InfoRow label="Ubicación" value={inspection.location || '—'} />
        <InfoRow label="Fotos" value={String(photos.length)} />
        <InfoRow label="Firma" value={signatures.length > 0 ? 'Sí' : 'No'} last />
      </View>

      {inspection.status === 'sent' && (
        <Text style={styles.sentNote}>
          Esta inspección ya fue compartida. Puedes volver a enviarla si lo necesitas.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.shareButton, isSharing && styles.buttonDisabled]}
        onPress={confirmShare}
        disabled={isSharing}
        activeOpacity={0.8}
      >
        <Text style={styles.shareButtonText}>
          {isSharing ? 'Preparando...' : inspection.status === 'sent' ? 'Volver a enviar por correo' : 'Compartir por correo'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.dismissAll()} activeOpacity={0.8}>
        <Text style={styles.backButtonText}>Volver al inicio</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete} activeOpacity={0.8}>
        <Text style={styles.deleteButtonText}>Eliminar inspección</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  clientName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  sentNote: {
    fontSize: 13,
    color: '#15803d',
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
  },
  shareButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deleteButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
});
