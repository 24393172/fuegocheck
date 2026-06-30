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
import { inspectionDate } from '../../../lib/form-data';
import { loadSettings } from '../../../lib/settings-manager';
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

// Plain text only: Android mail apps (Gmail) ignore HTML bodies from intents,
// so the full report travels in the attached Excel — the body is just a summary.
function buildEmailBody(
  inspection: Inspection,
  photoCount: number,
  hasSignature: boolean
): string {
  const attachmentParts = ['el reporte en Excel'];
  if (photoCount > 0) attachmentParts.push(`${photoCount} foto(s) de evidencia`);
  if (hasSignature) attachmentParts.push('la firma');

  return [
    'Fuego & Seguridad',
    'Reporte de inspección de bombas contra incendio',
    '',
    `Cliente: ${inspection.client_name}`,
    `Fecha: ${inspectionDate(inspection)}`,
    `Técnico: ${inspection.technician_name}`,
    `Ubicación: ${inspection.location}`,
    '',
    `Se adjunta ${attachmentParts.join(', ')}.`,
    '',
    'Generado automáticamente — Fuego & Seguridad',
  ].join('\n');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [insp, ph, sig, settings] = await Promise.all([
          getInspection(id),
          getPhotosByInspection(id),
          getSignaturesByInspection(id),
          loadSettings(),
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
        setRecipientEmail(settings.recipientEmail);
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

  // Builds the Excel + signature files and opens the mail composer.
  // IMPORTANT: the generated files are NOT deleted here — Gmail re-reads them
  // in the background when the email is actually sent, so deleting them right
  // after the composer closes makes the send fail and strands the email in
  // drafts. They are cleaned up on inspection delete and by the startup
  // routine in lib/attachment-files.ts.
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

    try {
      setIsSharing(true);

      // 1. Generate Excel (deterministic name — re-sharing overwrites it)
      const excelPath = await generateInspectionExcel(id);

      // 2. Save signatures as PNG files so they can be attached
      const sigPaths: string[] = [];
      for (const sig of signatures) {
        const path = await saveSignatureFile(
          sig.image_base64,
          `firma_${sig.signer_type}_${id.slice(0, 8)}.png`
        );
        sigPaths.push(path);
      }

      // 3. Attachments: Excel + photos + signatures (photos are NOT temp files)
      const attachments = [excelPath, ...photos.map((p) => p.local_uri), ...sigPaths];

      const subject = `[Inspección] ${inspection.client_name} - ${inspectionDate(inspection)} - ${inspection.technician_name}`;
      const body = buildEmailBody(inspection, photos.length, signatures.length > 0);

      // 4. Mark as sent before opening the composer. Android mail apps don't
      // reliably report back whether the email was actually sent, so we mark it
      // optimistically — the user can re-share from here if they cancel.
      const previousStatus = inspection.status;
      await updateStatus(id, 'sent');
      setInspection({ ...inspection, status: 'sent' });

      try {
        await MailComposer.composeAsync({
          recipients: [recipientEmail],
          subject,
          body,
          attachments,
        });
      } catch (composeError) {
        // The composer never opened — undo the optimistic 'sent' mark.
        await updateStatus(id, previousStatus);
        setInspection({ ...inspection, status: previousStatus });
        throw composeError;
      }
    } catch (error) {
      console.error('[share] Failed to share inspection:', error);
      Alert.alert('Error', 'No se pudo preparar el correo. Intenta de nuevo.');
    } finally {
      setIsSharing(false);
    }
  }

  function confirmShare(): void {
    if (!inspection) return;
    Alert.alert(
      'Compartir por correo',
      `Se abrirá tu app de correo con el Excel y las fotos adjuntas para enviar a:\n\n${recipientEmail}`,
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

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => router.replace(`/inspection/${id}`)}
        activeOpacity={0.8}
      >
        <Text style={styles.editButtonText}>Editar inspección</Text>
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
  editButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#1e3a5f',
    fontSize: 15,
    fontWeight: '600',
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
