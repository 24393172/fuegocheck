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
  createEmptyExtinguisher,
  hasAnyExtinguisherData,
  isExtinguisherComplete,
  normalizeExtinguisherCollection,
} from '../../../lib/extinguishers';
import { parseFormData } from '../../../lib/form-data';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { generateId } from '../../../lib/uuid';
import { INSPECTION_SCHEMAS } from '../../../schemas';
import { ExtinguisherRecord } from '../../../types/extinguisher.types';

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
        const locked = readonly === '1' || inspection.status === 'completed' || inspection.status === 'sent';
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
        if (itemId !== 'new' && !existing) {
          Alert.alert('Error', 'No se encontró el extintor.');
          router.back();
          return;
        }
        const initial = existing ?? createEmptyExtinguisher(recordId);
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
    if (readOnlyRef.current || !hasAnyExtinguisherData(values)) return;
    const current = await getInspection(id);
    if (!current) throw new Error('INSPECTION_NOT_FOUND');
    const fullData = parseFormData(current);
    const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
    const normalized = normalizeExtinguisherCollection(pumps.extintores);
    const existingIndex = normalized.collection.items.findIndex((item) => item.id === recordId);
    if (existingIndex < 0 && normalized.collection.items.length >= MAX_EXTINGUISHERS) {
      throw new Error('EXTINGUISHER_LIMIT_REACHED');
    }

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
    if (existingIndex >= 0) nextItems[existingIndex] = nextRecord;
    else nextItems.push(nextRecord);

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
    if (!hasAnyExtinguisherData(values)) {
      Alert.alert('Sin datos', 'Captura al menos un dato antes de guardar el extintor.');
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
          <Text style={styles.title}>{itemId === 'new' ? 'Nuevo extintor' : 'Editar extintor'}</Text>
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

      {extinguisherSchema.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <SectionHeader title={section.title} />
          {section.fields.map((field) => (
            <FormField
              key={field.key}
              field={field}
              control={control}
              readOnly={isReadOnly}
            />
          ))}
        </View>
      ))}

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
