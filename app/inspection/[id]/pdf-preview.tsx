import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { deleteInspectionCompletely, getInspection, updateStatus } from '../../../lib/repositories/inspections.repo';
import { getPhotosByInspection } from '../../../lib/repositories/photos.repo';
import { getSignaturesByInspection } from '../../../lib/repositories/signatures.repo';
import { inspectionDate } from '../../../lib/form-data';
import { loadSettings } from '../../../lib/settings-manager';
import { checkServerHealth, downloadOfficialReport, LocalServerApiError } from '../../../services/local-server-api';
import { Inspection, Photo, Signature } from '../../../types/inspection.types';
import StatusBadge from '../../../components/ui/StatusBadge';

function buildEmailBody(inspection: Inspection, photoCount: number): string {
  const attachments = ['el reporte oficial en Excel'];
  if (photoCount) attachments.push(`${photoCount} foto(s) de evidencia`);
  return [
    'Fuego & Seguridad', 'Reporte de inspección contra incendio', '',
    `Cliente: ${inspection.client_name}`, `Fecha: ${inspectionDate(inspection)}`,
    `Técnico: ${inspection.technician_name}`, `Ubicación: ${inspection.location}`, '',
    `Se adjunta ${attachments.join(' y ')}.`, '', 'Generado por Fuego & Seguridad',
  ].join('\n');
}

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
    Promise.all([getInspection(id), getPhotosByInspection(id), getSignaturesByInspection(id), loadSettings()])
      .then(([loadedInspection, loadedPhotos, loadedSignatures, settings]) => {
        if (cancelled) return;
        if (!loadedInspection) throw new Error('Inspection not found');
        setInspection(loadedInspection); setPhotos(loadedPhotos); setSignatures(loadedSignatures);
        setRecipientEmail(settings.recipientEmail);
      })
      .catch((error) => {
        console.error('[share] Failed to load inspection:', error);
        Alert.alert('Error', 'No se pudo cargar la inspección.'); router.back();
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [id, router]);

  function officialReportReference(): { id: string; downloadUrl: string } | null {
    if (inspection?.sync_status === 'synced' && inspection.official_report_id
        && inspection.official_report_download_url) {
      return { id: inspection.official_report_id, downloadUrl: inspection.official_report_download_url };
    }
    Alert.alert(
      'Sincronización requerida',
      'Para compartir el reporte oficial, primero sincroniza la inspección con el servidor local.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Volver a sincronizar', onPress: () => router.replace(`/inspection/${id}`) }]
    );
    return null;
  }

  async function downloadReport(): Promise<string | null> {
    const report = officialReportReference();
    if (!report) return null;
    await checkServerHealth();
    return downloadOfficialReport(report.downloadUrl, report.id, id);
  }

  async function shareByEmail(): Promise<void> {
    if (!inspection) return;
    if (!await MailComposer.isAvailableAsync()) {
      Alert.alert('No hay app de correo', 'Configura Gmail, Outlook u otra aplicación de correo e inténtalo nuevamente.');
      return;
    }
    try {
      setIsSharing(true);
      const excelPath = await downloadReport();
      if (!excelPath) return;
      const result = await MailComposer.composeAsync({
        recipients: recipientEmail ? [recipientEmail] : [],
        subject: `[Inspección] ${inspection.client_name} - ${inspectionDate(inspection)} - ${inspection.technician_name}`,
        body: buildEmailBody(inspection, photos.length),
        attachments: [excelPath, ...photos.map((photo) => photo.local_uri)],
      });
      if (Platform.OS === 'ios' && result.status === MailComposer.MailComposerStatus.SENT) {
        await updateStatus(id, 'sent'); setInspection({ ...inspection, status: 'sent' });
      } else if (result.status !== MailComposer.MailComposerStatus.CANCELLED) {
        if (inspection.status !== 'sent') {
          await updateStatus(id, 'mail_composer_opened');
          setInspection({ ...inspection, status: 'mail_composer_opened' });
        }
        Alert.alert('Aplicación de correo abierta', 'Se abrió la aplicación de correo. ExtinCheck no puede confirmar si el mensaje fue enviado.');
      }
    } catch (error) {
      console.error('[share] Failed to open email:', error);
      Alert.alert('Error', error instanceof LocalServerApiError ? error.message : 'No se pudo preparar el correo.');
    } finally { setIsSharing(false); }
  }

  async function shareOfficialReport(): Promise<void> {
    try {
      setIsSharing(true);
      if (!await Sharing.isAvailableAsync()) throw new Error('El menú para compartir no está disponible.');
      const fileUri = await downloadReport();
      if (!fileUri) return;
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Compartir reporte oficial',
      });
    } catch (error) {
      console.error('[share] Failed to share official report:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo compartir el reporte oficial.');
    } finally { setIsSharing(false); }
  }

  function confirmDelete() {
    Alert.alert('Eliminar inspección', '¿Seguro que deseas eliminar esta inspección? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await deleteInspectionCompletely(id); router.dismissAll(); }
        catch { Alert.alert('Error', 'No se pudo eliminar la inspección.'); }
      } },
    ]);
  }

  if (isLoading || !inspection) return <View style={styles.centered}><ActivityIndicator size="large" color="#1e3a5f" /></View>;
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.card}><View style={styles.cardHeader}><Text style={styles.clientName}>{inspection.client_name || 'Sin cliente'}</Text><StatusBadge status={inspection.status} /></View>
      <InfoRow label="Fecha" value={inspectionDate(inspection) || '—'} /><InfoRow label="Técnico" value={inspection.technician_name || '—'} />
      <InfoRow label="Ubicación" value={inspection.location || '—'} /><InfoRow label="Fotos" value={String(photos.length)} />
      <InfoRow label="Firma" value={signatures.length ? 'Sí' : 'No'} last /></View>
    {inspection.status === 'sent' && <Text style={styles.sentNote}>El sistema confirmó el envío desde el compositor de correo.</Text>}
    {inspection.status === 'mail_composer_opened' && <Text style={styles.openedNote}>Se abrió la aplicación de correo; el envío no pudo confirmarse.</Text>}
    <TouchableOpacity style={[styles.primaryButton, isSharing && styles.disabled]} disabled={isSharing} onPress={() => { shareByEmail().catch(console.error); }}><Text style={styles.primaryText}>{isSharing ? 'Preparando…' : 'Abrir cliente de correo'}</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.outlineButton, isSharing && styles.disabled]} disabled={isSharing} onPress={() => { shareOfficialReport().catch(console.error); }}><Text style={styles.outlineText}>Compartir reporte oficial</Text></TouchableOpacity>
    <TouchableOpacity style={styles.outlineButton} onPress={() => router.replace(`/inspection/${id}`)}><Text style={styles.outlineText}>Volver a la inspección</Text></TouchableOpacity>
    <TouchableOpacity style={styles.backButton} onPress={() => router.dismissAll()}><Text style={styles.backText}>Volver al inicio</Text></TouchableOpacity>
    <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}><Text style={styles.deleteText}>Eliminar inspección</Text></TouchableOpacity>
  </ScrollView>;
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' }, content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  clientName: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 14, color: '#6b7280' }, infoValue: { fontSize: 14, color: '#111827', fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sentNote: { fontSize: 13, color: '#15803d', backgroundColor: '#dcfce7', padding: 12, borderRadius: 8, textAlign: 'center' },
  openedNote: { fontSize: 13, color: '#1d4ed8', backgroundColor: '#dbeafe', padding: 12, borderRadius: 8, textAlign: 'center' },
  primaryButton: { backgroundColor: '#1e3a5f', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  outlineButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  outlineText: { color: '#1e3a5f', fontSize: 15, fontWeight: '600' }, disabled: { opacity: 0.6 },
  backButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  backText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  deleteButton: { paddingVertical: 14, alignItems: 'center', marginTop: 8 }, deleteText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
});
