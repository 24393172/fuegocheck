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
import { hydrantCollectionProgress, normalizeHydrantsData } from '../../../lib/hydrants';
import {
  InspectionFormatOption,
  normalizeSelectedFormatIds,
  schemasForSelectedFormatIds,
} from '../../../lib/inspection-formats';
import { getInspection, updateInspection, updateOfficialReport, updateStatus, updateSyncState } from '../../../lib/repositories/inspections.repo';
import { getSignaturesByInspection } from '../../../lib/repositories/signatures.repo';
import { deletePhoto, getPhotosByInspection, markPhotoError, markPhotoSynced, markPhotoUploading } from '../../../lib/repositories/photos.repo';
import { deletePhotoFiles } from '../../../lib/photo-manager';
import { PUMP_SCHEMAS, ansulR102Form, tableroAdForm } from '../../../schemas';
import { FormSchema } from '../../../types/form.types';
import { Inspection, Signature } from '../../../types/inspection.types';
import { FirePumpsData } from '../../../types/fire-pump.types';
import { AlarmsData, AlarmMobileFormId } from '../../../types/alarm.types';
import { AnsulData } from '../../../types/ansul.types';
import {
  ALARM_DEVICE_KEYS,
  ALARM_FORM_LABELS,
  ALARM_MOBILE_IDS,
  alarmMissingFields,
  alarmPayload,
  buildAlarmPanel,
  deriveDeviceStatus,
  derivePanelStatus,
  normalizeAlarmsData,
} from '../../../lib/alarms';
import {
  firePumpPayloadForms,
  firePumpProgress,
  normalizeFirePumpsData,
} from '../../../lib/fire-pumps';
import { resolveSyncOutcome } from '../../../lib/sync-status';
import {
  checkServerHealth,
  inspectionDateToIso,
  LocalServerApiError,
  deleteInspectionEvidence,
  finalizeInspectionEvidence,
  syncInspection,
  uploadInspectionEvidence,
} from '../../../services/local-server-api';
import {
  ANSUL_FORMAT_ID,
  ansulPayload,
  ansulProgress,
  normalizeAnsulData,
} from '../../../lib/ansul';

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
  if (schema.id === 'hidrantes') {
    const progress = hydrantCollectionProgress(data);
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
  const [firePumps, setFirePumps] = useState<FirePumpsData>(
    () => normalizeFirePumpsData(undefined).data
  );
  const [alarms, setAlarms] = useState<AlarmsData>(
    () => normalizeAlarmsData(undefined, tableroAdForm).data
  );
  const [ansul, setAnsul] = useState<AnsulData>(
    () => normalizeAnsulData(undefined, ansulR102Form).data
  );
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
          const normalizedFirePumps = normalizeFirePumpsData(data);
          const normalizedAlarms = normalizeAlarmsData(data, tableroAdForm);
          const normalizedAnsul = normalizeAnsulData(data, ansulR102Form);
          const selectedIds = normalizeSelectedFormatIds(data.selectedFormatIds);
          const hasSelectedFirePumps = PUMP_SCHEMAS.some((schema) => selectedIds.includes(schema.id));
          const hasSelectedAlarms = ALARM_MOBILE_IDS.some((formId) => selectedIds.includes(formId));
          const hasSelectedAnsul = selectedIds.includes(ANSUL_FORMAT_ID);
          let loadedInspection = insp;
          if ((hasSelectedFirePumps && (!data.firePumps || normalizedFirePumps.changed))
              || (hasSelectedAlarms && (!data.alarms || normalizedAlarms.changed))
              || (hasSelectedAnsul && (!data.ansul || normalizedAnsul.changed))) {
            const normalizedPumps = { ...((data.pumps ?? {}) as Record<string, unknown>) };
            if (hasSelectedAnsul) delete normalizedPumps[ANSUL_FORMAT_ID];
            const normalizedFormData = JSON.stringify({
              ...data,
              pumps: normalizedPumps,
              ...(hasSelectedFirePumps ? { firePumps: normalizedFirePumps.data } : {}),
              ...(hasSelectedAlarms ? { alarms: normalizedAlarms.data } : {}),
              ...(hasSelectedAnsul ? { ansul: normalizedAnsul.data } : {}),
            });
            await updateInspection(id, { form_data: normalizedFormData });
            loadedInspection = await getInspection(id) ?? { ...insp, form_data: normalizedFormData };
          }
          setInspection(loadedInspection);
          setPendingComment(insp.pending_comment ?? '');
          setPumpsData((data.pumps ?? {}) as Record<string, Record<string, unknown>>);
          setFirePumps(normalizedFirePumps.data);
          setAlarms(normalizedAlarms.data);
          setAnsul(normalizedAnsul.data);
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

  function getFormatProgress(schema: FormSchema) {
    if (PUMP_SCHEMAS.some((item) => item.id === schema.id)) {
      return firePumpProgress(
        schema,
        firePumps[schema.id as keyof FirePumpsData]
      );
    }
    if (schema.id === 'tablero_ad') {
      const formStatus = alarms.panel.status === 'not_applicable'
        ? 'not_applicable' : derivePanelStatus(tableroAdForm, alarms.panel);
      const answered = Object.values(alarms.panel.answers).filter((answer) => answer.answer).length;
      const total = tableroAdForm.sections.flatMap((section) => section.fields)
        .filter((field) => field.type === 'yes_no_na').length;
      return {
        total, answered,
        hasAnyData: formStatus !== 'not_started',
        complete: formStatus === 'complete' || formStatus === 'not_applicable',
        missing: formStatus === 'complete' || formStatus === 'not_applicable'
          ? [] : alarmMissingFields(alarms, tableroAdForm).filter((item) => item.startsWith('Tablero')),
      };
    }
    if (ALARM_MOBILE_IDS.includes(schema.id as AlarmMobileFormId)) {
      const key = ALARM_DEVICE_KEYS[schema.id as keyof typeof ALARM_DEVICE_KEYS];
      const collection = alarms[key];
      const formStatus = deriveDeviceStatus(collection);
      const complete = formStatus === 'not_applicable'
        || (formStatus === 'complete' && Boolean(alarms.systemName.trim()));
      return {
        total: collection.items.length,
        answered: collection.items.filter((item) =>
          [item.identifier, item.loop, item.deviceType, item.locationNameSnapshot].every((value) => value.trim())
          && [item.alarm, item.supervision, item.cleaning].every(Boolean)
        ).length,
        hasAnyData: formStatus !== 'not_started',
        complete,
        missing: complete ? [] : alarmMissingFields(alarms, tableroAdForm)
          .filter((item) => item.startsWith(ALARM_FORM_LABELS[schema.id as AlarmMobileFormId])),
      };
    }
    if (schema.id === ANSUL_FORMAT_ID) {
      return ansulProgress(ansulR102Form, ansul);
    }
    return {
      ...formatProgress(schema, pumpsData[schema.id] ?? {}),
      missing: [] as string[],
    };
  }

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
        ...(option.templateType === 'alarm'
          ? { alarms: normalizeAlarmsData(fullData, tableroAdForm).data }
          : {}),
        ...(option.schemaIds.includes(ANSUL_FORMAT_ID)
          ? { ansul: normalizeAnsulData(fullData, ansulR102Form).data }
          : {}),
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

  async function saveAlarmSystemName(value: string) {
    if (!inspection) return;
    const nextName = value.trim();
    const fullData = parseFormData(inspection);
    const normalized = normalizeAlarmsData(fullData, tableroAdForm);
    if (normalized.data.systemName === nextName) return;
    normalized.data.systemName = nextName;
    const nextFormData = JSON.stringify({ ...fullData, alarms: normalized.data });
    await updateInspection(id, { form_data: nextFormData });
    setAlarms(normalized.data);
    setInspection((current) => current ? { ...current, form_data: nextFormData, updated_at: Date.now() } : current);
  }

  async function toggleAlarmApplicability(formId: AlarmMobileFormId) {
    if (!inspection) return;
    try {
      const fullData = parseFormData(inspection);
      const normalized = normalizeAlarmsData(fullData, tableroAdForm);
      if (formId === 'tablero_ad') {
        normalized.data.panel.status = normalized.data.panel.status === 'not_applicable'
          ? derivePanelStatus(tableroAdForm, { ...normalized.data.panel, status: 'not_started' })
          : 'not_applicable';
        normalized.data.panel.updatedAt = Date.now();
      } else {
        const key = ALARM_DEVICE_KEYS[formId];
        const collection = normalized.data[key];
        normalized.data[key] = {
          ...collection,
          status: collection.status === 'not_applicable'
            ? deriveDeviceStatus({ ...collection, status: 'not_started' })
            : 'not_applicable',
          updatedAt: Date.now(),
        };
      }
      const nextFormData = JSON.stringify({ ...fullData, alarms: normalized.data });
      await updateInspection(id, { form_data: nextFormData });
      setAlarms(normalized.data);
      setInspection((current) => current ? { ...current, form_data: nextFormData, updated_at: Date.now() } : current);
    } catch (error) {
      console.error('[inspection] Could not change alarm applicability:', error);
      Alert.alert('Error', 'No se pudo cambiar la aplicabilidad del formulario.');
    }
  }

  function handleComplete() {
    if (!inspection) return;
    if (inspection.status === 'completed' || inspection.status === 'mail_composer_opened' || inspection.status === 'sent') {
      router.push(`/inspection/${id}/pdf-preview`);
      return;
    }

    const selectedIds = normalizeSelectedFormatIds(parseFormData(inspection).selectedFormatIds);
    const formats = schemasForSelectedFormatIds(selectedIds);
    const incompleteFormats = formats
      .map((schema) => ({ schema, progress: getFormatProgress(schema) }))
      .filter((item) => !item.progress.complete);
    if (incompleteFormats.length) {
      const details = incompleteFormats
        .filter((item) => item.progress.missing.length)
        .map((item) => `${item.schema.name}: ${item.progress.missing.slice(0, 8).join(', ')}`)
        .join('\n');
      Alert.alert(
        'Formatos incompletos',
        details
          ? `No se puede completar la inspección. Faltan:\n${details}`
          : 'Todavía hay formatos sin completar. Completa todos los formatos antes de enviar la inspección.'
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
      const selectedIds = normalizeSelectedFormatIds(fullData.selectedFormatIds);
      const normalizedPumps = { ...pumps };
      let normalizationChanged = false;
      if (selectedIds.includes('extintores')) {
        const normalized = normalizeExtinguisherCollection(pumps.extintores);
        normalizedPumps.extintores = normalized.collection;
        normalizationChanged = normalizationChanged || normalized.changed;
      }
      if (selectedIds.includes('hidrantes')) {
        const normalized = normalizeHydrantsData(pumps.hidrantes);
        normalizedPumps.hidrantes = normalized.collection;
        normalizationChanged = normalizationChanged || normalized.changed;
      }
      const normalizedFirePumps = normalizeFirePumpsData(fullData);
      if (PUMP_SCHEMAS.some((schema) => selectedIds.includes(schema.id))) {
        fullData.firePumps = normalizedFirePumps.data;
        normalizationChanged = normalizationChanged || normalizedFirePumps.changed;
      }
      const normalizedAlarms = normalizeAlarmsData(fullData, tableroAdForm);
      if (ALARM_MOBILE_IDS.some((formId) => selectedIds.includes(formId))) {
        fullData.alarms = normalizedAlarms.data;
        normalizationChanged = normalizationChanged || normalizedAlarms.changed;
      }
      const normalizedAnsul = normalizeAnsulData(fullData, ansulR102Form);
      if (selectedIds.includes(ANSUL_FORMAT_ID)) {
        fullData.ansul = normalizedAnsul.data;
        if (Object.prototype.hasOwnProperty.call(normalizedPumps, ANSUL_FORMAT_ID)) {
          delete normalizedPumps[ANSUL_FORMAT_ID];
          normalizationChanged = true;
        }
        normalizationChanged = normalizationChanged || normalizedAnsul.changed;
      }
      if (normalizationChanged) {
        const normalizedFormData = JSON.stringify({
          ...fullData,
          pumps: normalizedPumps,
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
      const siteData = getSiteData(currentInspection);
      const commonPayload = {
        inspectionId: currentInspection.id,
        company: {
          id: siteData.companyId ?? null,
          name: siteData.companyNameSnapshot || siteData.cliente || currentInspection.client_name,
        },
        branch: siteData.branchId || siteData.branchNameSnapshot
          ? { id: siteData.branchId ?? null, name: siteData.branchNameSnapshot ?? '' }
          : null,
        date: inspectionDateToIso(siteData.fecha),
        attention: siteData.atencion,
        area: siteData.area,
        technician: { id: null, name: siteData.tecnico || currentInspection.technician_name },
        syncVersion: currentInspection.updated_at,
      };
      const evidence = await getPhotosByInspection(id, true);
      const activeEvidence = evidence.filter((photo) => !photo.is_deleted);
      const response = await syncInspection({
        ...commonPayload,
        selectedFormatIds: selectedIds,
        extinguishers: selectedIds.includes('extintores')
          ? normalizeExtinguisherCollection(currentPumps.extintores).collection.items : undefined,
        hydrants: selectedIds.includes('hidrantes')
          ? normalizeHydrantsData(currentPumps.hidrantes).collection.items : undefined,
        firePumps: PUMP_SCHEMAS.some((schema) => selectedIds.includes(schema.id))
          ? firePumpPayloadForms(normalizeFirePumpsData(fullData).data)
          : undefined,
        alarms: ALARM_MOBILE_IDS.some((formId) => selectedIds.includes(formId))
          ? alarmPayload(normalizeAlarmsData(fullData, tableroAdForm).data)
          : undefined,
        ansul: selectedIds.includes(ANSUL_FORMAT_ID)
          ? ansulPayload(normalizeAnsulData(fullData, ansulR102Form).data)
          : undefined,
        signature: signature ? {
          mimeType: 'image/png',
          dataBase64: signature.image_base64.replace(/^data:image\/png;base64,/, ''),
          signedAt: new Date(signature.signed_at).toISOString(),
          signerName: currentInspection.technician_name,
        } : null,
        evidenceManifest: activeEvidence.map((photo) => ({
          evidenceId: photo.id, formatType: photo.format_type, formType: photo.form_type, itemId: photo.item_id,
          fieldKey: photo.field_key, caption: photo.caption,
          locationNameSnapshot: photo.location_name_snapshot,
          capturedAt: new Date(photo.created_at).toISOString(), updatedAt: new Date(photo.updated_at).toISOString(),
        })),
      });

      const missingEvidence = new Set(response.missingEvidenceIds ?? []);
      for (const photo of activeEvidence.filter((item) => item.sync_status !== 'synced' || missingEvidence.has(item.id))) {
        try {
          await markPhotoUploading(photo.id);
          const uploaded = await uploadInspectionEvidence(photo);
          await markPhotoSynced(photo.id, uploaded.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo subir la evidencia';
          await markPhotoError(photo.id, message);
          const remaining = (await getPhotosByInspection(id)).filter((item) => item.sync_status !== 'synced').length;
          throw new Error(`EVIDENCE_PENDING:${remaining}`);
        }
      }
      for (const photo of evidence.filter((item) => item.is_deleted)) {
        try {
          await deleteInspectionEvidence(id, photo.server_evidence_id ?? photo.id);
        } catch (error) {
          if (!(error instanceof LocalServerApiError && error.status === 404)) {
            await markPhotoError(photo.id, error instanceof Error ? error.message : 'No se pudo eliminar la evidencia');
            throw new Error('EVIDENCE_PENDING:1');
          }
        }
        await deletePhoto(photo.id);
        await deletePhotoFiles(photo.local_uri, photo.thumbnail_uri);
      }
      const finalized = await finalizeInspectionEvidence(id, activeEvidence.map((photo) => photo.id));

      const syncedAt = Date.now();
      const syncedFormatIds = response.syncedFormatIds ?? [];
      const outcome = resolveSyncOutcome(selectedIds, syncedFormatIds);
      await updateSyncState(id, outcome.status, outcome.message, syncedFormatIds);
      await updateOfficialReport(id, finalized.report);
      setInspection((current) => current ? {
        ...current,
        sync_status: outcome.status,
        synced_at: outcome.status === 'synced' ? syncedAt : current.synced_at,
        last_sync_attempt: syncedAt,
        sync_error: outcome.message,
        synced_format_ids: JSON.stringify(syncedFormatIds),
        official_report_id: finalized.report.id,
        official_report_filename: finalized.report.filename,
        official_report_download_url: finalized.report.downloadUrl,
      } : current);
      Alert.alert(
        outcome.status === 'synced' ? 'Sincronización completa' : 'Sincronización parcial',
        outcome.message ?? 'Inspección sincronizada correctamente con el servidor local.'
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Unknown synchronization error';
      const evidencePending = rawMessage.startsWith('EVIDENCE_PENDING:');
      const message = evidencePending
        ? `Datos sincronizados, ${rawMessage.split(':')[1] || '1'} fotografía(s) pendiente(s).`
        : rawMessage;
      await updateSyncState(id, evidencePending ? 'partial' : 'error', message).catch((stateError) =>
        console.error('[inspection] Could not persist sync error:', stateError)
      );
      setInspection((current) => current ? {
        ...current,
        sync_status: evidencePending ? 'partial' : 'error',
        last_sync_attempt: Date.now(),
        sync_error: message,
      } : current);

      if (evidencePending) {
        Alert.alert('Evidencias pendientes', message);
      } else if (error instanceof LocalServerApiError && ['NETWORK', 'TIMEOUT', 'CONFIGURATION'].includes(error.code)) {
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
  const locked = inspection.status === 'completed' || inspection.status === 'mail_composer_opened' || inspection.status === 'sent';
  const selectedFormatIds = normalizeSelectedFormatIds(parseFormData(inspection).selectedFormatIds);
  const schemas = schemasForSelectedFormatIds(selectedFormatIds);
  const pumpIds = new Set(PUMP_SCHEMAS.map((schema) => schema.id));
  const pumpSchemas = schemas.filter((schema) => pumpIds.has(schema.id));
  const alarmSchemas = schemas.filter((schema) =>
    ALARM_MOBILE_IDS.includes(schema.id as AlarmMobileFormId)
  );
  const otherSchemas = schemas.filter((schema) =>
    !pumpIds.has(schema.id) && !ALARM_MOBILE_IDS.includes(schema.id as AlarmMobileFormId)
  );
  const completedPumpForms = pumpSchemas.filter((schema) => getFormatProgress(schema).complete).length;
  const completedAlarmForms = alarmSchemas.filter((schema) => getFormatProgress(schema).complete).length;
  const includesExtinguishers = selectedFormatIds.includes('extintores');
  const includesHydrants = selectedFormatIds.includes('hidrantes');
  const progress = schemas.map((schema) => getFormatProgress(schema));
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
    const item = getFormatProgress(schema);
    const alarmStatus = schema.id === 'tablero_ad'
      ? alarms.panel.status
      : ALARM_MOBILE_IDS.includes(schema.id as AlarmMobileFormId)
        ? alarms[ALARM_DEVICE_KEYS[schema.id as keyof typeof ALARM_DEVICE_KEYS]].status
        : null;
    const statusText = alarmStatus === 'not_applicable'
      ? 'No aplica'
      : !item.hasAnyData
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
          if (schema.id === 'hidrantes') {
            router.push(`/inspection/${id}/hydrants${locked ? '?readonly=1' : ''}`);
            return;
          }
          if (ALARM_MOBILE_IDS.includes(schema.id as AlarmMobileFormId) && schema.id !== 'tablero_ad') {
            router.push(`/inspection/${id}/alarm-devices?form=${schema.id}${locked ? '&readonly=1' : ''}`);
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
        {!locked && ALARM_MOBILE_IDS.includes(schema.id as AlarmMobileFormId) && (
          <TouchableOpacity
            style={styles.notApplicableButton}
            onPress={(event) => {
              event.stopPropagation();
              toggleAlarmApplicability(schema.id as AlarmMobileFormId);
            }}
            accessibilityLabel={alarmStatus === 'not_applicable'
              ? 'Marcar formulario como aplicable'
              : 'Marcar formulario como no aplica'}
          >
            <Text style={styles.notApplicableText}>
              {alarmStatus === 'not_applicable' ? 'Aplicar' : 'No aplica'}
            </Text>
          </TouchableOpacity>
        )}
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
              <View>
                <Text style={styles.groupTitle}>Bombas contra incendio</Text>
                <Text style={styles.groupProgress}>
                  {completedPumpForms} de {pumpSchemas.length} formularios completos
                </Text>
              </View>
            </View>
            {pumpSchemas.map(renderFormatCard)}
          </View>
        )}
        {alarmSchemas.length > 0 && (
          <View style={styles.alarmGroup}>
            <View style={styles.groupHeader}>
              <Ionicons name="notifications" size={18} color="#6d28d9" />
              <View style={styles.alarmHeaderCopy}>
                <Text style={styles.alarmGroupTitle}>Alarmas y detección</Text>
                <Text style={styles.groupProgress}>
                  {completedAlarmForms} de {alarmSchemas.length} formularios completos
                </Text>
              </View>
            </View>
            <View style={styles.systemBox}>
              <Text style={styles.systemLabel}>Sistema compartido</Text>
              <TextInput
                style={styles.systemInput}
                editable={!locked}
                value={alarms.systemName}
                onChangeText={(value) => setAlarms((current) => ({ ...current, systemName: value }))}
                onEndEditing={(event) => {
                  saveAlarmSystemName(event.nativeEvent.text).catch((error) => {
                    console.error('[inspection] Could not save alarm system:', error);
                    Alert.alert('Error', 'No se pudo guardar el sistema.');
                  });
                }}
                placeholder="Ej. NOTIFIER 2020"
                placeholderTextColor="#94a3b8"
              />
              {!!alarms.systemNameDiscrepancies.length && (
                <Text style={styles.discrepancyText}>
                  Se conservaron {alarms.systemNameDiscrepancies.length} valor(es) histórico(s) diferentes para revisión.
                </Text>
              )}
            </View>
            {alarmSchemas.map(renderFormatCard)}
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

        {locked && (
          <View style={styles.syncBox}>
            <View style={styles.syncHeader}>
              <Text style={styles.syncTitle}>Servidor local</Text>
              <Text style={[
                styles.syncStatus,
                inspection.sync_status === 'synced' && styles.syncStatusSuccess,
                inspection.sync_status === 'partial' && styles.syncStatusError,
                inspection.sync_status === 'error' && styles.syncStatusError,
              ]}>
                {inspection.sync_status === 'synced'
                  ? 'Sincronizada'
                  : inspection.sync_status === 'partial'
                    ? 'Parcial'
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
  alarmGroup: { padding: 10, gap: 8, borderRadius: 14, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#d8b4fe' },
  groupHeader: { paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 7 },
  alarmHeaderCopy: { flex: 1 },
  groupTitle: { color: '#1e3a5f', fontSize: 14, fontWeight: '800' },
  alarmGroupTitle: { color: '#4c1d95', fontSize: 14, fontWeight: '800' },
  groupProgress: { color: '#64748b', fontSize: 12, marginTop: 2 },
  systemBox: { gap: 6, padding: 10, borderRadius: 11, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e9d5ff' },
  systemLabel: { color: '#4c1d95', fontSize: 13, fontWeight: '800' },
  systemInput: { minHeight: 44, borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 9, paddingHorizontal: 11, color: '#1e293b', backgroundColor: '#ffffff' },
  discrepancyText: { color: '#b45309', fontSize: 11, lineHeight: 16 },
  formatRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  formatInfo: { flex: 1 },
  formatName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  formatStatus: { fontSize: 13, marginTop: 2 },
  notApplicableButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  notApplicableText: { color: '#6d28d9', fontSize: 11, fontWeight: '800' },
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
