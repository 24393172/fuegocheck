import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useForm, useWatch } from 'react-hook-form';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FormField from '../../../components/forms/FormField';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  MAX_EXTINGUISHERS,
  configuredExtinguisher,
  createConfiguredExtinguisher,
  createEmptyExtinguisher,
  hasAnyExtinguisherInspectionData,
  isExtinguisherComplete,
  normalizeExtinguisherCollection,
} from '../../../lib/extinguishers';
import { getSiteData, parseFormData } from '../../../lib/form-data';
import {
  getInspection,
  saveConfiguredExtinguisher,
  updateInspection,
} from '../../../lib/repositories/inspections.repo';
import { generateId } from '../../../lib/uuid';
import { INSPECTION_SCHEMAS } from '../../../schemas';
import { ExtinguisherRecord } from '../../../types/extinguisher.types';
import { getCatalogLocation } from '../../../services/catalog-sync';
import EquipmentEvidenceField from '../../../components/forms/EquipmentEvidenceField';

const extinguisherSchema = INSPECTION_SCHEMAS.find((schema) => schema.id === 'extintores');

export default function ExtinguisherEditorScreen() {
  const { id, itemId = 'new', readonly } = useLocalSearchParams<{
    id: string;
    itemId?: string;
    readonly?: string;
  }>();
  const router = useRouter();
  const [recordId] = useState(() => itemId === 'new' ? generateId() : itemId);
  const [isLoading, setIsLoading] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(readonly === '1');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const createdAtRef = useRef(Date.now());
  const pendingRef = useRef<ExtinguisherRecord | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const readOnlyRef = useRef(readonly === '1');
  const configuredRef = useRef(false);

  const { control, reset, getValues } = useForm<ExtinguisherRecord>({
    defaultValues: createEmptyExtinguisher(recordId),
  });
  const watchedValues = useWatch({ control });

  useEffect(() => {
    async function load() {
      try {
        const inspection = await getInspection(id);
        if (!inspection) {
          Alert.alert('Error', 'No se encontró la inspección.');
          router.back();
          return;
        }
        const locked = readonly === '1' || inspection.status === 'completed' || inspection.status === 'mail_composer_opened' || inspection.status === 'sent';
        setIsReadOnly(locked);
        readOnlyRef.current = locked;

        const fullData = parseFormData(inspection);
        const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
        const normalized = normalizeExtinguisherCollection(pumps.extintores);
        if (normalized.changed) {
          await updateInspection(id, {
            form_data: JSON.stringify({
              ...fullData,
              pumps: { ...pumps, extintores: normalized.collection },
            }),
          });
        }

        const existing = normalized.collection.items.find((item) => item.id === recordId);
        const site = getSiteData(inspection);
        const catalogItem = itemId === 'new' ? null : await getCatalogLocation(itemId);
        const configuredCatalogItem = catalogItem?.equipmentType === 'extinguisher'
          && catalogItem.active
          && catalogItem.companyId === site.companyId
          ? catalogItem
          : null;
        const belongsToInspection = Boolean(
          configuredCatalogItem
        );
        configuredRef.current = belongsToInspection;
        if (!existing && !belongsToInspection) {
          Alert.alert('Error', 'No se encontró el extintor.');
          router.back();
          return;
        }
        const initial = configuredCatalogItem
          ? createConfiguredExtinguisher(configuredExtinguisher(configuredCatalogItem), existing)
          : existing!;
        createdAtRef.current = initial.createdAt;
        reset(initial);
        loadedRef.current = true;
      } catch (error) {
        console.error('[extinguisher-editor] Failed to load:', error);
        Alert.alert('Error', 'No se pudo cargar el extintor.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id, itemId, readonly, recordId, reset, router]);

  const persist = useCallback(async (values: ExtinguisherRecord) => {
    if (readOnlyRef.current || !hasAnyExtinguisherInspectionData(values)) return;
    if (configuredRef.current) {
      await saveConfiguredExtinguisher(id, values);
      return;
    }
    const current = await getInspection(id);
    if (!current) throw new Error('INSPECTION_NOT_FOUND');
    const fullData = parseFormData(current);
    const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
    const normalized = normalizeExtinguisherCollection(pumps.extintores);
    const existingIndex = normalized.collection.items.findIndex((item) => item.id === recordId);
    if (existingIndex < 0) throw new Error('CONFIGURED_EXTINGUISHER_NOT_FOUND');

    const now = Date.now();
    const rawRecord: ExtinguisherRecord = {
      ...createEmptyExtinguisher(recordId, createdAtRef.current),
      ...values,
      id: recordId,
      createdAt: createdAtRef.current,
      updatedAt: now,
    };
    const nextRecord = normalizeExtinguisherCollection({ items: [rawRecord] }, now)
      .collection.items[0];
    const nextItems = [...normalized.collection.items];
    nextItems[existingIndex] = nextRecord;

    await updateInspection(id, {
      form_data: JSON.stringify({
        ...fullData,
        pumps: { ...pumps, extintores: { items: nextItems } },
      }),
    });
  }, [id, recordId]);

  const queueSave = useCallback((values: ExtinguisherRecord) => {
    const snapshot = { ...values };
    const operation = saveQueueRef.current.then(() => persist(snapshot));
    saveQueueRef.current = operation.catch(() => {});
    return operation;
  }, [persist]);

  useEffect(() => {
    if (!loadedRef.current || isReadOnly) return;
    const values = watchedValues as ExtinguisherRecord;
    pendingRef.current = values;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        setSaveError(null);
        await queueSave(values);
        if (pendingRef.current === values) pendingRef.current = null;
      } catch (error) {
        console.error('[extinguisher-editor] Autosave failed:', error);
        setSaveError('No se pudieron guardar los cambios en el dispositivo.');
      } finally {
        setIsSaving(false);
      }
    }, 600);
  }, [isReadOnly, queueSave, watchedValues]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    if (pending && !readOnlyRef.current) {
      queueSave(pending).catch((error) =>
        console.error('[extinguisher-editor] Flush on exit failed:', error)
      );
    }
  }, [queueSave]);

  async function saveAndGoBack() {
    if (isReadOnly) {
      router.back();
      return;
    }
    const values = getValues();
    if (!hasAnyExtinguisherInspectionData(values)) {
      Alert.alert('Sin datos', 'Captura al menos un dato de inspección antes de guardar el extintor.');
      return;
    }
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsSaving(true);
      setSaveError(null);
      await queueSave(values);
      pendingRef.current = null;
      router.back();
    } catch (error) {
      console.error('[extinguisher-editor] Save failed:', error);
      if (error instanceof Error && error.message === 'EXTINGUISHER_LIMIT_REACHED') {
        Alert.alert('Límite alcanzado', `Esta plantilla admite un máximo de ${MAX_EXTINGUISHERS} extintores.`);
      } else {
        setSaveError('No se pudieron guardar los cambios en el dispositivo.');
        Alert.alert('Error', 'No se pudo guardar el extintor.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !extinguisherSchema) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  const complete = isExtinguisherComplete(watchedValues);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.summary}>
        <View>
          <Text style={styles.title}>Inspección de extintor</Text>
          <Text style={styles.subtitle}>Los cambios se guardan automáticamente en el dispositivo.</Text>
        </View>
        <View style={[styles.statusBadge, complete ? styles.completeBadge : styles.incompleteBadge]}>
          <Text style={[styles.statusText, complete ? styles.completeText : styles.incompleteText]}>
            {complete ? 'Completo' : 'Incompleto'}
          </Text>
        </View>
        {isReadOnly && <Text style={styles.readOnly}>Vista de solo lectura</Text>}
        {isSaving && <Text style={styles.saving}>Guardando…</Text>}
        {saveError && <Text style={styles.error}>{saveError}</Text>}
      </View>

      <View style={styles.equipmentSummary}>
        <Text style={styles.equipmentHeading}>Equipo configurado</Text>
        <Text style={styles.equipmentIdentifier}>
          {watchedValues.numero ? `Extintor ${watchedValues.numero}` : 'Extintor sin identificador'}
        </Text>
        <Text style={styles.equipmentLocation}>{watchedValues.ubicacion || 'Sin ubicación configurada'}</Text>
        <Text style={styles.equipmentDetails}>
          {[watchedValues.tipo_extintor, watchedValues.capacidad].filter(Boolean).join(' · ') || 'Tipo y capacidad no configurados'}
        </Text>
      </View>

      {extinguisherSchema.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <SectionHeader title={section.title} />
          {section.fields
            .filter((field) => !['numero', 'ubicacion', 'tipo_extintor', 'capacidad'].includes(field.key))
            .map((field) => (
              <FormField key={field.key} field={field} control={control} readOnly={isReadOnly} />
            ))}
        </View>
      ))}

      <EquipmentEvidenceField
        inspectionId={id}
        formatType="extintores"
        itemId={recordId}
        locationNameSnapshot={watchedValues.locationNameSnapshot || watchedValues.ubicacion || ''}
        readOnly={isReadOnly}
        beforeCapture={() => queueSave(getValues())}
        canCapture={hasAnyExtinguisherInspectionData(watchedValues)}
      />

      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.disabledButton]}
        onPress={saveAndGoBack}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <Text style={styles.saveButtonText}>{isReadOnly ? 'Volver' : 'Guardar y volver'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingBottom: 40, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', gap: 7 },
  equipmentSummary: { marginHorizontal: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', gap: 4 },
  equipmentHeading: { color: '#1d4ed8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  equipmentIdentifier: { color: '#1e293b', fontSize: 18, fontWeight: '800' },
  equipmentLocation: { color: '#334155', fontSize: 14, fontWeight: '700' },
  equipmentDetails: { color: '#64748b', fontSize: 13 },
  title: { color: '#1f3f66', fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 3, color: '#64748b', fontSize: 12, lineHeight: 18 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  completeBadge: { backgroundColor: '#dcfce7' },
  incompleteBadge: { backgroundColor: '#ffedd5' },
  statusText: { fontSize: 11, fontWeight: '800' },
  completeText: { color: '#15803d' },
  incompleteText: { color: '#b45309' },
  readOnly: { color: '#92400e', fontSize: 12, fontWeight: '700' },
  saving: { color: '#2563eb', fontSize: 12, fontWeight: '700' },
  error: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  section: { backgroundColor: '#ffffff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  saveButton: { minHeight: 52, marginHorizontal: 16, marginTop: 10, borderRadius: 12, backgroundColor: '#1f3f66', alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.5 },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
