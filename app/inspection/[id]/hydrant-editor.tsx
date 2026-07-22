import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useForm, useWatch } from 'react-hook-form';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FormField from '../../../components/forms/FormField';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  MAX_HYDRANTS,
  createEmptyHydrant,
  hasAnyHydrantData,
  isHydrantComplete,
  normalizeHydrantsData,
} from '../../../lib/hydrants';
import { getSiteData, parseFormData } from '../../../lib/form-data';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { generateId } from '../../../lib/uuid';
import { INSPECTION_SCHEMAS } from '../../../schemas';
import { HydrantRecord } from '../../../types/hydrant.types';
import { CatalogLocation } from '../../../types/catalog.types';
import { getLocationsByBranch, getLocationsByCompany } from '../../../services/catalog-sync';

const hydrantSchema = INSPECTION_SCHEMAS.find((schema) => schema.id === 'hidrantes');

export default function HydrantEditorScreen() {
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
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const loadedRef = useRef(false);
  const createdAtRef = useRef(Date.now());
  const pendingRef = useRef<HydrantRecord | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const readOnlyRef = useRef(readonly === '1');

  const { control, reset, getValues, setValue } = useForm<HydrantRecord>({
    defaultValues: createEmptyHydrant(recordId),
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
        const normalized = normalizeHydrantsData(pumps.hidrantes);
        if (normalized.changed) {
          await updateInspection(id, {
            form_data: JSON.stringify({
              ...fullData,
              pumps: { ...pumps, hidrantes: normalized.collection },
            }),
          });
        }

        const existing = normalized.collection.items.find((item) => item.id === recordId);
        if (itemId !== 'new' && !existing) {
          Alert.alert('Error', 'No se encontró el hidrante.');
          router.back();
          return;
        }
        const initial = existing ?? createEmptyHydrant(recordId);
        createdAtRef.current = initial.createdAt;
        reset(initial);

        const site = getSiteData(inspection);
        if (site.companyId) {
          try {
            const availableLocations = site.branchId
              ? await getLocationsByBranch(site.branchId, 'hydrant')
              : await getLocationsByCompany(site.companyId, 'hydrant');
            setLocations(availableLocations);
          } catch (error) {
            console.error('[hydrant-editor] Failed to load catalog locations:', error);
            setLocations([]);
          }
        }
        loadedRef.current = true;
      } catch (error) {
        console.error('[hydrant-editor] Failed to load:', error);
        Alert.alert('Error', 'No se pudo cargar el hidrante.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id, itemId, readonly, recordId, reset, router]);

  const persist = useCallback(async (values: HydrantRecord) => {
    if (readOnlyRef.current || !hasAnyHydrantData(values)) return;
    const current = await getInspection(id);
    if (!current) throw new Error('INSPECTION_NOT_FOUND');
    const fullData = parseFormData(current);
    const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
    const normalized = normalizeHydrantsData(pumps.hidrantes);
    const existingIndex = normalized.collection.items.findIndex((item) => item.id === recordId);
    if (existingIndex < 0 && normalized.collection.items.length >= MAX_HYDRANTS) {
      throw new Error('HYDRANT_LIMIT_REACHED');
    }

    const now = Date.now();
    const rawRecord: HydrantRecord = {
      ...createEmptyHydrant(recordId, createdAtRef.current),
      ...values,
      id: recordId,
      ubicacion: values.locationNameSnapshot || values.ubicacion,
      createdAt: createdAtRef.current,
      updatedAt: now,
    };
    const nextRecord = normalizeHydrantsData({ items: [rawRecord] }, now).collection.items[0];
    const nextItems = [...normalized.collection.items];
    if (existingIndex >= 0) nextItems[existingIndex] = nextRecord;
    else nextItems.push(nextRecord);

    await updateInspection(id, {
      form_data: JSON.stringify({
        ...fullData,
        pumps: { ...pumps, hidrantes: { items: nextItems } },
      }),
    });
  }, [id, recordId]);

  const queueSave = useCallback((values: HydrantRecord) => {
    const snapshot = { ...values };
    const operation = saveQueueRef.current.then(() => persist(snapshot));
    saveQueueRef.current = operation.catch(() => {});
    return operation;
  }, [persist]);

  useEffect(() => {
    if (!loadedRef.current || isReadOnly) return;
    const values = watchedValues as HydrantRecord;
    pendingRef.current = values;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        setSaveError(null);
        await queueSave(values);
        if (pendingRef.current === values) pendingRef.current = null;
      } catch (error) {
        console.error('[hydrant-editor] Autosave failed:', error);
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
      queueSave(pending).catch((error) => console.error('[hydrant-editor] Flush on exit failed:', error));
    }
  }, [queueSave]);

  async function saveAndGoBack() {
    if (isReadOnly) {
      router.back();
      return;
    }
    const values = getValues();
    if (!hasAnyHydrantData(values)) {
      Alert.alert('Sin datos', 'Captura al menos un dato antes de guardar el hidrante.');
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
      console.error('[hydrant-editor] Save failed:', error);
      if (error instanceof Error && error.message === 'HYDRANT_LIMIT_REACHED') {
        Alert.alert('Límite alcanzado', `Esta plantilla admite un máximo de ${MAX_HYDRANTS} hidrantes.`);
      } else {
        setSaveError('No se pudieron guardar los cambios en el dispositivo.');
        Alert.alert('Error', 'No se pudo guardar el hidrante.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const normalizedSearch = locationSearch.trim().toLocaleLowerCase('es-MX');
  const filteredLocations = useMemo(() => {
    if (!normalizedSearch) return locations;
    return locations.filter((location) =>
      [location.name, location.area, location.floor, location.reference]
        .some((value) => value.toLocaleLowerCase('es-MX').includes(normalizedSearch))
    );
  }, [locations, normalizedSearch]);

  if (isLoading || !hydrantSchema) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1e3a5f" /></View>;
  }

  const complete = isHydrantComplete(watchedValues);

  function selectCatalogLocation(location: CatalogLocation) {
    setValue('locationId', location.id, { shouldDirty: true });
    setValue('locationNameSnapshot', location.name, { shouldDirty: true });
    setValue('ubicacion', location.name, { shouldDirty: true });
    setValue('customLocation', false, { shouldDirty: true });
  }

  function selectManualLocation() {
    const currentName = getValues('ubicacion') || getValues('locationNameSnapshot');
    setValue('locationId', null, { shouldDirty: true });
    setValue('locationNameSnapshot', currentName, { shouldDirty: true });
    setValue('ubicacion', currentName, { shouldDirty: true });
    setValue('customLocation', true, { shouldDirty: true });
  }

  function updateManualLocation(value: string) {
    setValue('locationId', null, { shouldDirty: true });
    setValue('locationNameSnapshot', value, { shouldDirty: true });
    setValue('ubicacion', value, { shouldDirty: true });
    setValue('customLocation', true, { shouldDirty: true });
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.summary}>
        <View>
          <Text style={styles.title}>{itemId === 'new' ? 'Nuevo hidrante' : 'Editar hidrante'}</Text>
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

      {hydrantSchema.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <SectionHeader title={section.title} />
          {section.fields.map((field) => field.key === 'ubicacion' ? (
            <View key={field.key} style={styles.locationField}>
              <Text style={styles.fieldLabel}>Ubicación</Text>
              {isReadOnly ? (
                <View style={styles.readOnlyInput}>
                  <Text style={styles.readOnlyInputText}>
                    {watchedValues.locationNameSnapshot || watchedValues.ubicacion || 'Sin ubicación'}
                  </Text>
                </View>
              ) : (
                <>
                  {locations.length > 0 && (
                    <>
                      <TextInput
                        style={styles.searchInput}
                        value={locationSearch}
                        onChangeText={setLocationSearch}
                        placeholder="Buscar ubicación"
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="none"
                      />
                      <View style={styles.locationOptions}>
                        {filteredLocations.map((location) => {
                          const selected = watchedValues.locationId === location.id && !watchedValues.customLocation;
                          return (
                            <TouchableOpacity
                              key={location.id}
                              style={[styles.locationOption, selected && styles.selectedLocationOption]}
                              onPress={() => selectCatalogLocation(location)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                            >
                              <Text style={[styles.locationName, selected && styles.selectedLocationName]}>{location.name}</Text>
                              {!![location.area, location.floor].filter(Boolean).length && (
                                <Text style={styles.locationDetail}>{[location.area, location.floor].filter(Boolean).join(' · ')}</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {filteredLocations.length === 0 && <Text style={styles.locationEmpty}>No se encontraron ubicaciones.</Text>}
                      </View>
                    </>
                  )}
                  {locations.length === 0 && (
                    <Text style={styles.locationHelp}>No hay ubicaciones de hidrantes en el catálogo para esta empresa o sucursal.</Text>
                  )}
                  <TouchableOpacity
                    style={[styles.manualLocationButton, watchedValues.customLocation && styles.selectedManualButton]}
                    onPress={selectManualLocation}
                    accessibilityRole="button"
                  >
                    <Text style={styles.manualLocationButtonText}>+ Usar otra ubicación</Text>
                  </TouchableOpacity>
                  {watchedValues.customLocation && (
                    <TextInput
                      style={styles.manualInput}
                      value={watchedValues.ubicacion ?? ''}
                      onChangeText={updateManualLocation}
                      placeholder="Escribe la ubicación"
                      placeholderTextColor="#94a3b8"
                    />
                  )}
                </>
              )}
            </View>
          ) : (
            <FormField key={field.key} field={field} control={control} readOnly={isReadOnly} />
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
  locationField: { paddingHorizontal: 16, paddingVertical: 12, gap: 9 },
  fieldLabel: { color: '#334155', fontSize: 14, fontWeight: '700' },
  searchInput: { minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, color: '#0f172a', backgroundColor: '#ffffff' },
  locationOptions: { gap: 7 },
  locationOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#f8fafc' },
  selectedLocationOption: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  locationName: { color: '#1e293b', fontSize: 14, fontWeight: '700' },
  selectedLocationName: { color: '#1d4ed8' },
  locationDetail: { marginTop: 2, color: '#64748b', fontSize: 12 },
  locationEmpty: { paddingVertical: 7, color: '#64748b', fontSize: 12 },
  locationHelp: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  manualLocationButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, backgroundColor: '#fff7ed' },
  selectedManualButton: { borderColor: '#c2410c', backgroundColor: '#ffedd5' },
  manualLocationButtonText: { color: '#c2410c', fontSize: 14, fontWeight: '800' },
  manualInput: { minHeight: 46, borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 12, color: '#0f172a', backgroundColor: '#ffffff' },
  readOnlyInput: { minHeight: 46, justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#f1f5f9' },
  readOnlyInputText: { color: '#475569', fontSize: 14 },
  saveButton: { minHeight: 52, marginHorizontal: 16, marginTop: 10, borderRadius: 12, backgroundColor: '#1f3f66', alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.5 },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
