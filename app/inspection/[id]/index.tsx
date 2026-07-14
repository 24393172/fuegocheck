import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AddInspectionFormatModal from '../../../components/forms/AddInspectionFormatModal';
import SignatureField from '../../../components/forms/SignatureField';
import { getSiteData, parseFormData } from '../../../lib/form-data';
import { extinguisherCollectionProgress } from '../../../lib/extinguishers';
import { normalizeExtinguisherCollection } from '../../../lib/extinguishers';
import {
  InspectionFormatOption,
  normalizeSelectedFormatIds,
  schemasForSelectedFormatIds,
} from '../../../lib/inspection-formats';
import { getInspection, updateInspection, updateStatus, updateSyncState } from '../../../lib/repositories/inspections.repo';
import { getSignaturesByInspection } from '../../../lib/repositories/signatures.repo';
import { PUMP_SCHEMAS } from '../../../schemas';
import { FormSchema } from '../../../types/form.types';
import { Inspection, Signature } from '../../../types/inspection.types';
import {
  checkServerHealth,
  inspectionDateToIso,
  LocalServerApiError,
  syncExtinguisherInspection,
} from '../../../services/local-server-api';

function formatProgress(schema: FormSchema, data: Record<string, unknown>) {
  if (schema.id === 'extintores') {
    const progress = extinguisherCollectionProgress(data);
    return {
      total: progress.total,
      answered: progress.completed,
      hasAnyData: progress.hasAnyData,
      complete: progress.complete,
    };
  }
  let total = 0;
  let answered = 0;
  let hasAnyData = false;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = data[field.key];
      const filled = value !== undefined && value !== null && value !== '';
      if (filled) hasAnyData = true;
      if (field.type === 'yes_no_na') {
        total++;
        if (filled) answered++;
      }
    }
  }
  return { total, answered, hasAnyData, complete: total > 0 && answered === total };
}

export default function InspectionIndexScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [pumpsData, setPumpsData] = useState<Record<string, Record<string, unknown>>>({});
  const [signature, setSignature] = useState<Signature | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingComment, setPendingComment] = useState('');
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [isAddingFormat, setIsAddingFormat] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        try {
          const [insp, sigs] = await Promise.all([
            getInspection(id),
            getSignaturesByInspection(id),
          ]);
          if (cancelled) return;
          if (!insp) {
            Alert.alert('Error', 'No se encontró la inspección.');
            router.back();
            return;
          }
          const data = parseFormData(insp);
          setInspection(insp);
          setPendingComment(insp.pending_comment ?? '');
          setPumpsData((data.pumps ?? {}) as Record<string, Record<string, unknown>>);
          setSignature(sigs.find((item) => item.signer_type === 'technician') ?? null);
        } catch (error) {
          console.error('[inspection] Failed to load:', error);
          Alert.alert('Error', 'No se pudo cargar la inspección.');
          router.back();
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      }
      load();
      return () => { cancelled = true; };
    }, [id, router])
  );

  async function handleAddFormat(option: InspectionFormatOption) {
    if (!inspection || isAddingFormat) return;
    try {
      setIsAddingFormat(true);
      const fullData = parseFormData(inspection);
      const currentIds = normalizeSelectedFormatIds(fullData.selectedFormatIds);
      const nextIds = [...new Set([...currentIds, ...option.schemaIds])];
      const nextFormData = JSON.stringify({
        ...fullData,
        selectedFormatIds: nextIds,
        pumps: fullData.pumps ?? {},
      });

      await updateInspection(id, { form_data: nextFormData });
      setInspection((current) => current ? {
        ...current,
        form_data: nextFormData,
        updated_at: Date.now(),
      } : current);
      setShowFormatSelector(false);
    } catch (error) {
      console.error('[inspection] Failed to add format:', error);
      Alert.alert('Error', 'No se pudo agregar el formato. Intenta de nuevo.');
    } finally {
      setIsAddingFormat(false);
    }
  }

  function handleComplete() {
    if (!inspection) return;
    if (inspection.status === 'completed' || inspection.status === 'sent') {
      router.push(`/inspection/${id}/pdf-preview`);
      return;
    }

    const selectedIds = normalizeSelectedFormatIds(parseFormData(inspection).selectedFormatIds);
    const formats = schemasForSelectedFormatIds(selectedIds);
    const hasIncompleteFormat = formats.some(
      (schema) => !formatProgress(schema, pumpsData[schema.id] ?? {}).complete
    );
    if (hasIncompleteFormat) {
      Alert.alert(
        'Formatos incompletos',
        'Todavía hay formatos sin completar. Completa todos los formatos antes de enviar la inspección.'
      );
      return;
    }
    if (!signature) {
      Alert.alert('Falta la firma', 'Agrega la firma del técnico antes de enviar.');
      return;
    }

    async function completeAndOpenReport() {
      try {
        await updateStatus(id, 'completed');
        router.push(`/inspection/${id}/pdf-preview`);
      } catch (error) {
        console.error('[inspection] Failed to complete:', error);
        Alert.alert('Error', 'No se pudo continuar. Intenta de nuevo.');
      }
    }
    completeAndOpenReport();
  }

  async function handlePending() {
    const comment = pendingComment.trim();
    if (!comment) {
      Alert.alert('Comentario requerido', 'Explica qué falta antes de marcar la inspección como pendiente.');
      return;
    }
    try {
      await updateStatus(id, 'pending', comment);
      setInspection((current) => current
        ? { ...current, status: 'pending', pending_comment: comment }
        : current);
      Alert.alert('Inspección pendiente', 'El motivo quedó guardado.');
    } catch (error) {
      console.error('[inspection] Failed to mark pending:', error);
      Alert.alert('Error', 'No se pudo marcar la inspección como pendiente.');
    }
  }

  async function handleServerSync() {
    if (!inspection || isSyncing) return;
    try {
      setIsSyncing(true);
      let currentInspection = inspection;
      let fullData = parseFormData(currentInspection);
      const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
      const normalized = normalizeExtinguisherCollection(pumps.extintores);
      if (normalized.changed) {
        const normalizedFormData = JSON.stringify({
          ...fullData,
          pumps: { ...pumps, extintores: normalized.collection },
        });
        await updateInspection(id, { form_data: normalizedFormData });
        const refreshed = await getInspection(id);
        if (!refreshed) throw new Error('Inspection not found after normalization');
        currentInspection = refreshed;
        fullData = parseFormData(refreshed);
        setInspection(refreshed);
      }

      await updateSyncState(id, 'syncing');
      setInspection((current) => current ? { ...current, sync_status: 'syncing', sync_error: null } : current);

      await checkServerHealth();
      const currentPumps = (fullData.pumps ?? {}) as Record<string, unknown>;
      const extinguishers = normalizeExtinguisherCollection(currentPumps.extintores).collection.items;
      const siteData = getSiteData(currentInspection);
      await syncExtinguisherInspection({
        inspectionId: currentInspection.id,
        company: {
          id: siteData.companyId ?? null,
          name: siteData.companyNameSnapshot || siteData.cliente || currentInspection.client_name,
        },
        date: inspectionDateToIso(siteData.fecha),
        technician: { id: null, name: siteData.tecnico || currentInspection.technician_name },
        extinguishers,
        syncVersion: currentInspection.updated_at,
      });

      const syncedAt = Date.now();
      await updateSyncState(id, 'synced');
      setInspection((current) => current ? {
        ...current,
        sync_status: 'synced',
        synced_at: syncedAt,
        last_sync_attempt: syncedAt,
        sync_error: null,
      } : current);
      Alert.alert('Sincronización completa', 'Inspección sincronizada correctamente con el servidor local.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown synchronization error';
      await updateSyncState(id, 'error', message).catch((stateError) =>
        console.error('[inspection] Could not persist sync error:', stateError)
      );
      setInspection((current) => current ? {
        ...current,
        sync_status: 'error',
        last_sync_attempt: Date.now(),
        sync_error: message,
      } : current);

      if (error instanceof LocalServerApiError && ['NETWORK', 'TIMEOUT', 'CONFIGURATION'].includes(error.code)) {
        Alert.alert(
          'Servidor no disponible',
          'No se encontró el servidor local. Verifica que la computadora esté encendida y conectada a la misma red Wi-Fi. La inspección continúa guardada en este dispositivo.'
        );
      } else {
        Alert.alert(
          'No se pudo sincronizar',
          'No se pudo sincronizar la inspección. Revisa los datos e inténtalo nuevamente.'
        );
      }
    } finally {
      setIsSyncing(false);
    }
  }

  if (isLoading || !inspection) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  const site = getSiteData(inspection);
  const locked = inspection.status === 'completed' || inspection.status === 'sent';
  const selectedFormatIds = normalizeSelectedFormatIds(parseFormData(inspection).selectedFormatIds);
  const schemas = schemasForSelectedFormatIds(selectedFormatIds);
  const pumpIds = new Set(PUMP_SCHEMAS.map((schema) => schema.id));
  const pumpSchemas = schemas.filter((schema) => pumpIds.has(schema.id));
  const otherSchemas = schemas.filter((schema) => !pumpIds.has(schema.id));
  const includesExtinguishers = selectedFormatIds.includes('extintores');
  const progress = schemas.map((schema) => formatProgress(schema, pumpsData[schema.id] ?? {}));
  const allComplete = progress.length > 0 && progress.every((item) => item.complete);
  const anyStarted = progress.some((item) => item.hasAnyData);
  const overallStatus = inspection.status === 'pending'
    ? 'Pendiente'
    : allComplete
      ? 'Completa'
      : anyStarted
        ? 'En progreso'
        : 'Sin empezar';

  function renderFormatCard(schema: FormSchema) {
    const item = formatProgress(schema, pumpsData[schema.id] ?? {});
    const statusText = !item.hasAnyData
      ? 'Sin empezar'
      : item.complete
        ? `Completa · ${item.answered}/${item.total}`
        : `En progreso · ${item.answered}/${item.total}`;
    const statusColor = !item.hasAnyData ? '#6b7280' : item.complete ? '#15803d' : '#b45309';

    return (
      <TouchableOpacity
        key={schema.id}
        style={styles.formatRow}
        onPress={() => {
          if (schema.id === 'extintores') {
            router.push(`/inspection/${id}/extinguishers${locked ? '?readonly=1' : ''}`);
            return;
          }
          router.push(`/inspection/${id}/fill?pump=${schema.id}${locked ? '&readonly=1' : ''}`);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.formatInfo}>
          <Text style={styles.formatName}>{schema.name}</Text>
          <Text style={[styles.formatStatus, { color: statusColor }]}>{statusText}</Text>
        </View>
        <Ionicons
          name={item.complete ? 'checkmark-circle' : 'chevron-forward'}
          size={21}
          color={item.complete ? '#16a34a' : '#94a3b8'}
        />
      </TouchableOpacity>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.client}>{site.cliente || 'Sin cliente'}</Text>
            <Text style={styles.meta}>{[site.area, site.fecha].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={styles.overallBadge}>
            <Text style={styles.overallBadgeText}>{overallStatus}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Formato</Text>
        {pumpSchemas.length > 0 && (
          <View style={styles.formatGroup}>
            <View style={styles.groupHeader}>
              <Ionicons name="water" size={18} color="#2563eb" />
              <Text style={styles.groupTitle}>Bombas contra incendio</Text>
            </View>
            {pumpSchemas.map(renderFormatCard)}
          </View>
        )}
        {otherSchemas.map(renderFormatCard)}

        {!locked && (
          <TouchableOpacity
            style={styles.addFormatButton}
            onPress={() => setShowFormatSelector(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Agregar otro formato"
          >
            <Ionicons name="add" size={21} color="#1f3f66" />
            <Text style={styles.addFormatText}>Agregar otro formato</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>Firma del técnico</Text>
        <View style={styles.signatureBox}>
          <SignatureField
            inspectionId={id}
            signerType="technician"
            label="Firma del técnico inspector"
            signature={signature}
            onSignatureSaved={setSignature}
            onSignatureCleared={() => setSignature(null)}
            readOnly={locked}
          />
        </View>

        {!locked && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingLabel}>Motivo si queda pendiente</Text>
            <TextInput
              style={styles.pendingInput}
              value={pendingComment}
              onChangeText={setPendingComment}
              placeholder="Ej. Falta acceso al cuarto de bombas"
              placeholderTextColor="#6b7280"
              multiline
            />
            <TouchableOpacity style={styles.pendingButton} onPress={handlePending} activeOpacity={0.8}>
              <Text style={styles.pendingButtonText}>Marcar como pendiente</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.completeButton} onPress={handleComplete} activeOpacity={0.8}>
          <Text style={styles.completeButtonText}>
            {locked ? 'Ver / enviar reporte' : 'Completar y enviar'}
          </Text>
        </TouchableOpacity>

        {locked && includesExtinguishers && (
          <View style={styles.syncBox}>
            <View style={styles.syncHeader}>
              <Text style={styles.syncTitle}>Servidor local</Text>
              <Text style={[
                styles.syncStatus,
                inspection.sync_status === 'synced' && styles.syncStatusSuccess,
                inspection.sync_status === 'error' && styles.syncStatusError,
              ]}>
                {inspection.sync_status === 'synced'
                  ? 'Sincronizada'
                  : inspection.sync_status === 'syncing'
                    ? 'Sincronizando'
                    : inspection.sync_status === 'error'
                      ? 'Error'
                      : 'Pendiente'}
              </Text>
            </View>
            {inspection.sync_error && (
              <Text style={styles.syncError} numberOfLines={3}>{inspection.sync_error}</Text>
            )}
            <TouchableOpacity
              style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
              onPress={handleServerSync}
              disabled={isSyncing}
              activeOpacity={0.8}
            >
              {isSyncing && <ActivityIndicator size="small" color="#ffffff" />}
              <Text style={styles.syncButtonText}>
                {isSyncing ? 'Sincronizando…' : 'Sincronizar con servidor'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <AddInspectionFormatModal
        visible={showFormatSelector}
        selectedFormatIds={selectedFormatIds}
        saving={isAddingFormat}
        onClose={() => setShowFormatSelector(false)}
        onAdd={handleAddFormat}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerText: { flex: 1 },
  client: { fontSize: 20, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  overallBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#e2e8f0' },
  overallBadgeText: { color: '#334155', fontSize: 11, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
  formatGroup: { padding: 10, gap: 8, borderRadius: 14, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  groupHeader: { paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupTitle: { color: '#1e3a5f', fontSize: 14, fontWeight: '800' },
  formatRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  formatInfo: { flex: 1 },
  formatName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  formatStatus: { fontSize: 13, marginTop: 2 },
  addFormatButton: { minHeight: 58, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#94a3b8', borderRadius: 12, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addFormatText: { color: '#1f3f66', fontSize: 15, fontWeight: '800' },
  signatureBox: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  completeButton: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  completeButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  pendingBox: { marginTop: 10, gap: 8 },
  pendingLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pendingInput: { minHeight: 72, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, backgroundColor: '#ffffff', color: '#111827', textAlignVertical: 'top' },
  pendingButton: { borderWidth: 1, borderColor: '#d97706', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  pendingButtonText: { color: '#b45309', fontWeight: '700' },
  syncBox: { marginTop: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', gap: 10 },
  syncHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  syncTitle: { color: '#1e3a5f', fontSize: 14, fontWeight: '800' },
  syncStatus: { color: '#64748b', fontSize: 12, fontWeight: '800' },
  syncStatusSuccess: { color: '#15803d' },
  syncStatusError: { color: '#dc2626' },
  syncError: { color: '#b91c1c', fontSize: 11, lineHeight: 16 },
  syncButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#2563eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  syncButtonDisabled: { opacity: 0.55 },
  syncButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
