import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm, FieldValues, useWatch, Controller } from 'react-hook-form';
import { Inspection, Photo } from '../../../types/inspection.types';
import { FormSchema } from '../../../types/form.types';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { getPhotosByInspection } from '../../../lib/repositories/photos.repo';
import { getSiteData, parseFormData } from '../../../lib/form-data';
import { INSPECTION_SCHEMAS, PUMP_SCHEMAS } from '../../../schemas';
import {
  buildFirePumpForm,
  firePumpFormToFlatValues,
  normalizeFirePumpsData,
} from '../../../lib/fire-pumps';
import { FirePumpFormData, FirePumpFormId } from '../../../types/fire-pump.types';
import { AlarmPanelData } from '../../../types/alarm.types';
import {
  buildAlarmPanel,
  normalizeAlarmsData,
  panelToFlatValues,
} from '../../../lib/alarms';
import { tableroAdForm } from '../../../schemas';
import { useInspectionStore } from '../../../store/inspection.store';
import FormField from '../../../components/forms/FormField';
import PhotoField from '../../../components/forms/PhotoField';
import SectionHeader from '../../../components/ui/SectionHeader';
import { CatalogLocation } from '../../../types/catalog.types';
import { getLocationsByBranch, getLocationsByCompany } from '../../../services/catalog-sync';
import { AnsulData } from '../../../types/ansul.types';
import {
  ANSUL_FORMAT_ID,
  ansulProgress,
  ansulToFlatValues,
  buildAnsulData,
  normalizeAnsulData,
} from '../../../lib/ansul';
import { ansulR102Form } from '../../../schemas';

// Photos are stored per pump so they don't collide between the pumps of one
// inspection: the field_key is prefixed with the pump id (e.g. "diesel:photo_general").
function photoKey(pump: string, fieldKey: string): string {
  return `${pump}:${fieldKey}`;
}

function computeProgress(
  schema: FormSchema,
  values: FieldValues,
  photos: Record<string, Photo>
): { filled: number; total: number } {
  let total = 0;
  let filled = 0;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      total++;
      if (field.type === 'photo') {
        if (photos[field.key]) filled++;
      } else {
        const v = values[field.key];
        if (v !== undefined && v !== null && v !== '') filled++;
      }
    }
  }
  return { filled, total };
}

export default function FillScreen() {
  const { id, pump, readonly } = useLocalSearchParams<{ id: string; pump: string; readonly?: string }>();
  const router = useRouter();
  const { isSaving, saveError, setIsSaving, setSaveError } = useInspectionStore();

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [photosByKey, setPhotosByKey] = useState<Record<string, Photo>>({});
  const [isReadOnly, setIsReadOnly] = useState(readonly === '1');
  const [catalogLocations, setCatalogLocations] = useState<CatalogLocation[]>([]);
  const [locationSearch, setLocationSearch] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValuesRef = useRef<FieldValues | null>(null);
  // The full form_data (site + every pump). Autosave only replaces this pump's
  // slice, so the other pumps and the site data are never overwritten.
  const fullDataRef = useRef<Record<string, unknown>>({});
  const firePumpFormRef = useRef<FirePumpFormData | null>(null);
  const alarmPanelRef = useRef<AlarmPanelData | null>(null);
  const ansulRef = useRef<AnsulData | null>(null);

  const { control, watch, reset, setValue, getValues } = useForm<FieldValues>({ defaultValues: {} });
  const watchedValues = useWatch({ control });
  const normalizedLocationSearch = locationSearch.trim().toLocaleLowerCase('es-MX');
  const filteredCatalogLocations = useMemo(() => {
    if (!normalizedLocationSearch) return catalogLocations;
    return catalogLocations.filter((location) =>
      [location.name, location.area, location.floor, location.reference]
        .some((value) => value.toLocaleLowerCase('es-MX').includes(normalizedLocationSearch))
    );
  }, [catalogLocations, normalizedLocationSearch]);

  useEffect(() => {
    async function load() {
      if (pump === 'extintores') {
        router.replace(`/inspection/${id}/extinguishers${readonly === '1' ? '?readonly=1' : ''}`);
        return;
      }
      if (pump === 'hidrantes') {
        router.replace(`/inspection/${id}/hydrants${readonly === '1' ? '?readonly=1' : ''}`);
        return;
      }
      try {
        const s = INSPECTION_SCHEMAS.find((x) => x.id === pump) ?? null;
        if (!s) {
          Alert.alert('Error', 'Tipo de bomba no reconocido.');
          router.back();
          return;
        }
        const insp: Inspection | null = await getInspection(id);
        if (!insp) {
          Alert.alert('Error', 'No se encontró la inspección.');
          router.back();
          return;
        }

        const fullData = parseFormData(insp);
        setIsReadOnly(readonly === '1' || insp.status === 'completed' || insp.status === 'mail_composer_opened' || insp.status === 'sent');
        if (!fullData.pumps || typeof fullData.pumps !== 'object') fullData.pumps = {};
        fullDataRef.current = fullData;

        const photos = await getPhotosByInspection(id);
        const prefix = `${pump}:`;
        const pumpPhotos: Record<string, Photo> = {};
        for (const p of photos) {
          if (p.field_key.startsWith(prefix)) {
            pumpPhotos[p.field_key.slice(prefix.length)] = p;
          }
        }

        setSchema(s);
        setPhotosByKey(pumpPhotos);
        const pumps = fullData.pumps as Record<string, Record<string, unknown>>;
        const isFirePump = PUMP_SCHEMAS.some((item) => item.id === pump);
        let currentValues: Record<string, unknown>;
        if (isFirePump) {
          const normalized = normalizeFirePumpsData(fullData);
          const firePumpForm = normalized.data[pump as FirePumpFormId];
          firePumpFormRef.current = firePumpForm;
          currentValues = firePumpFormToFlatValues(firePumpForm);
          if (normalized.changed || !fullData.firePumps) {
            fullData.firePumps = normalized.data;
            fullDataRef.current = fullData;
            await updateInspection(id, { form_data: JSON.stringify(fullData) });
          }
        } else if (pump === 'tablero_ad') {
          const normalized = normalizeAlarmsData(fullData, tableroAdForm);
          alarmPanelRef.current = normalized.data.panel;
          currentValues = panelToFlatValues(normalized.data.panel);
          if (normalized.changed || !fullData.alarms) {
            fullData.alarms = normalized.data;
            fullDataRef.current = fullData;
            await updateInspection(id, { form_data: JSON.stringify(fullData) });
          }
        } else if (pump === ANSUL_FORMAT_ID) {
          const normalized = normalizeAnsulData(fullData, ansulR102Form);
          ansulRef.current = normalized.data;
          currentValues = ansulToFlatValues(normalized.data);
          const nextPumps = { ...pumps };
          const hadLegacySlice = Object.prototype.hasOwnProperty.call(nextPumps, ANSUL_FORMAT_ID);
          delete nextPumps[ANSUL_FORMAT_ID];
          if (normalized.changed || !fullData.ansul || hadLegacySlice) {
            fullData.ansul = normalized.data;
            fullData.pumps = nextPumps;
            fullDataRef.current = fullData;
            await updateInspection(id, { form_data: JSON.stringify(fullData) });
          }
        } else {
          currentValues = { ...(pumps[pump] ?? {}) };
        }
        if (pump === 'hidrantes') {
          const legacyLocation = typeof currentValues.ubicacion === 'string' ? currentValues.ubicacion : '';
          const existingLocationId = typeof currentValues.locationId === 'string' && currentValues.locationId
            ? currentValues.locationId
            : null;
          currentValues.locationId = existingLocationId;
          currentValues.locationNameSnapshot =
            typeof currentValues.locationNameSnapshot === 'string'
              ? currentValues.locationNameSnapshot
              : legacyLocation;
          currentValues.customLocation = currentValues.customLocation === true || (!existingLocationId && !!legacyLocation);

          const site = getSiteData(insp);
          if (site.companyId) {
            try {
              setCatalogLocations(site.branchId
                ? await getLocationsByBranch(site.branchId, 'hydrant')
                : await getLocationsByCompany(site.companyId, 'hydrant'));
            } catch (error) {
              console.error('[fill] Failed to load hydrant locations:', error);
              setCatalogLocations([]);
            }
          }
        }
        reset(currentValues);
      } catch (error) {
        console.error('[fill] Failed to load:', error);
        Alert.alert('Error', 'No se pudo cargar la bomba.');
        router.back();
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [id, pump]);

  // Merges the current pump's values into the full form_data and persists it.
  function persist(values: FieldValues): Promise<void> {
    if (schema && PUMP_SCHEMAS.some((item) => item.id === pump)) {
      const normalized = normalizeFirePumpsData(fullDataRef.current);
      const form = buildFirePumpForm(
        schema,
        values as Record<string, unknown>,
        firePumpFormRef.current ?? normalized.data[pump as FirePumpFormId]
      );
      firePumpFormRef.current = form;
      fullDataRef.current = {
        ...fullDataRef.current,
        firePumps: {
          ...normalized.data,
          [pump]: form,
        },
      };
      return updateInspection(id, { form_data: JSON.stringify(fullDataRef.current) });
    }
    if (schema && pump === 'tablero_ad') {
      const normalized = normalizeAlarmsData(fullDataRef.current, tableroAdForm);
      const panel = buildAlarmPanel(
        schema,
        values as Record<string, unknown>,
        alarmPanelRef.current ?? normalized.data.panel
      );
      alarmPanelRef.current = panel;
      fullDataRef.current = {
        ...fullDataRef.current,
        alarms: { ...normalized.data, panel },
      };
      return updateInspection(id, { form_data: JSON.stringify(fullDataRef.current) });
    }
    if (schema && pump === ANSUL_FORMAT_ID) {
      const normalized = normalizeAnsulData(fullDataRef.current, ansulR102Form);
      const ansul = buildAnsulData(
        schema,
        values as Record<string, unknown>,
        ansulRef.current ?? normalized.data
      );
      ansulRef.current = ansul;
      const pumps = {
        ...((fullDataRef.current.pumps ?? {}) as Record<string, Record<string, unknown>>),
      };
      delete pumps[ANSUL_FORMAT_ID];
      fullDataRef.current = { ...fullDataRef.current, pumps, ansul };
      return updateInspection(id, { form_data: JSON.stringify(fullDataRef.current) });
    }
    const pumps = (fullDataRef.current.pumps ?? {}) as Record<string, Record<string, unknown>>;
    fullDataRef.current = { ...fullDataRef.current, pumps: { ...pumps, [pump]: values } };
    return updateInspection(id, { form_data: JSON.stringify(fullDataRef.current) });
  }

  useEffect(() => {
    if (!schema || isReadOnly) return;

    const subscription = watch((values) => {
      pendingValuesRef.current = values;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          setIsSaving(true);
          setSaveError(null);
          await persist(values);
          if (pendingValuesRef.current === values) pendingValuesRef.current = null;
        } catch (error) {
          console.error('[fill] Autosave failed:', error);
          setSaveError('Error al guardar. Verifica tu almacenamiento.');
        } finally {
          setIsSaving(false);
        }
      }, 500);
    });

    return () => {
      subscription.unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Flush any unsaved changes so leaving the screen never loses data.
      const pending = pendingValuesRef.current;
      if (pending) {
        persist(pending).catch((error) => console.error('[fill] Flush on exit failed:', error));
      }
    };
  }, [schema, id, pump, isReadOnly]);

  function renderField(field: FormSchema['sections'][number]['fields'][number]) {
    if (field.type === 'photo') {
      return (
        <View key={field.key} style={styles.mediaFieldWrapper}>
          <Text style={styles.mediaLabel}>{field.label}</Text>
          <PhotoField
            inspectionId={id}
            fieldKey={photoKey(pump, field.key)}
            label={field.label}
            photo={photosByKey[field.key] ?? null}
            onPhotoSaved={(photo) =>
              setPhotosByKey((prev) => ({ ...prev, [field.key]: photo }))
            }
            onPhotoDeleted={() =>
              setPhotosByKey((prev) => {
                const next = { ...prev };
                delete next[field.key];
                return next;
              })
            }
            readOnly={isReadOnly}
          />
        </View>
      );
    }

    if (pump === 'hidrantes' && field.key === 'ubicacion') {
      const selectedLocationId = typeof watchedValues.locationId === 'string' ? watchedValues.locationId : null;
      const customLocation = watchedValues.customLocation === true;
      const locationName = typeof watchedValues.locationNameSnapshot === 'string'
        ? watchedValues.locationNameSnapshot
        : typeof watchedValues.ubicacion === 'string' ? watchedValues.ubicacion : '';
      return (
        <View key={field.key} style={styles.locationField}>
          <Text style={styles.mediaLabel}>Ubicación</Text>
          {isReadOnly ? (
            <View style={styles.readOnlyLocation}>
              <Text style={styles.readOnlyLocationText}>{locationName || 'Sin ubicación'}</Text>
            </View>
          ) : (
            <>
              {catalogLocations.length > 0 && (
                <>
                  <TextInput
                    style={styles.locationSearch}
                    value={locationSearch}
                    onChangeText={setLocationSearch}
                    placeholder="Buscar ubicación"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                  />
                  <View style={styles.locationOptions}>
                    {filteredCatalogLocations.map((location) => {
                      const selected = selectedLocationId === location.id && !customLocation;
                      return (
                        <TouchableOpacity
                          key={location.id}
                          style={[styles.locationOption, selected && styles.selectedLocationOption]}
                          onPress={() => {
                            setValue('locationId', location.id, { shouldDirty: true });
                            setValue('locationNameSnapshot', location.name, { shouldDirty: true });
                            setValue('ubicacion', location.name, { shouldDirty: true });
                            setValue('customLocation', false, { shouldDirty: true });
                          }}
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
                    {filteredCatalogLocations.length === 0 && (
                      <Text style={styles.locationHelp}>No se encontraron ubicaciones.</Text>
                    )}
                  </View>
                </>
              )}
              {catalogLocations.length === 0 && (
                <Text style={styles.locationHelp}>No hay ubicaciones de hidrantes para esta empresa o sucursal.</Text>
              )}
              <TouchableOpacity
                style={[styles.manualLocationButton, customLocation && styles.selectedManualLocation]}
                onPress={() => {
                  const current = String(getValues('ubicacion') ?? getValues('locationNameSnapshot') ?? '');
                  setValue('locationId', null, { shouldDirty: true });
                  setValue('locationNameSnapshot', current, { shouldDirty: true });
                  setValue('ubicacion', current, { shouldDirty: true });
                  setValue('customLocation', true, { shouldDirty: true });
                }}
              >
                <Text style={styles.manualLocationText}>+ Usar otra ubicación</Text>
              </TouchableOpacity>
              {customLocation && (
                <TextInput
                  style={styles.manualLocationInput}
                  value={typeof watchedValues.ubicacion === 'string' ? watchedValues.ubicacion : ''}
                  onChangeText={(value) => {
                    setValue('locationId', null, { shouldDirty: true });
                    setValue('locationNameSnapshot', value, { shouldDirty: true });
                    setValue('ubicacion', value, { shouldDirty: true });
                    setValue('customLocation', true, { shouldDirty: true });
                  }}
                  placeholder="Escribe la ubicación"
                  placeholderTextColor="#94a3b8"
                />
              )}
            </>
          )}
        </View>
      );
    }

    if (pump === ANSUL_FORMAT_ID && field.type === 'yes_no_na') {
      return (
        <View key={field.key} style={styles.ansulQuestion}>
          <FormField field={field} control={control} readOnly={isReadOnly} />
          <View style={styles.ansulTechnicalRow}>
            {([
              [`${field.key}_quantity`, 'Cantidad'],
              [`${field.key}_model`, 'Modelo'],
            ] as const).map(([name, label]) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field: controllerField }) => (
                  <View style={styles.ansulTechnicalField}>
                    <Text style={styles.ansulTechnicalLabel}>{label} (opcional)</Text>
                    <TextInput
                      style={styles.ansulTechnicalInput}
                      value={controllerField.value === undefined || controllerField.value === null
                        ? ''
                        : String(controllerField.value)}
                      onChangeText={controllerField.onChange}
                      onBlur={controllerField.onBlur}
                      editable={!isReadOnly}
                      maxLength={200}
                      placeholder={label}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                )}
              />
            ))}
          </View>
        </View>
      );
    }

    return <FormField key={field.key} field={field} control={control} readOnly={isReadOnly} />;
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  if (!schema) return null;

  const ansulDraft = pump === ANSUL_FORMAT_ID
    ? buildAnsulData(
      ansulR102Form,
      watchedValues as Record<string, unknown>,
      ansulRef.current ?? normalizeAnsulData(undefined, ansulR102Form).data,
      ansulRef.current?.updatedAt ?? 0
    )
    : null;
  const ansulFormProgress = ansulDraft ? ansulProgress(ansulR102Form, ansulDraft) : null;
  const { filled, total } = ansulFormProgress
    ? { filled: ansulFormProgress.answered, total: ansulFormProgress.total }
    : computeProgress(schema, watchedValues, photosByKey);
  const progressPct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <Text style={styles.pumpTitle}>{schema.name}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {filled} / {total} campos{progressPct === 100 ? ' ✓' : ''}
        </Text>
        {ansulFormProgress && (
          <Text style={styles.ansulStatus}>
            Estado: {ansulFormProgress.status === 'complete'
              ? 'Completo'
              : ansulFormProgress.status === 'in_progress' ? 'En progreso' : 'Sin iniciar'}
          </Text>
        )}
        {isReadOnly && <Text style={styles.readOnlyText}>Vista de solo lectura</Text>}
      </View>

      {saveError && (
        <View style={styles.saveErrorBanner}>
          <Text style={styles.saveErrorText}>⚠ {saveError}</Text>
        </View>
      )}

      <ScrollView>
        {schema.sections.map((section) => (
          <View key={section.id}>
            <SectionHeader title={section.title} />
            {section.fields.map(renderField)}
          </View>
        ))}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Listo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {isSaving && (
        <View style={styles.savingBadge}>
          <Text style={styles.savingText}>Guardando...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 6,
  },
  pumpTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a5f',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#1e3a5f',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'right',
  },
  locationField: { paddingHorizontal: 16, paddingVertical: 12, gap: 9, backgroundColor: '#ffffff' },
  locationSearch: { minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, color: '#0f172a' },
  locationOptions: { gap: 7 },
  locationOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#f8fafc' },
  selectedLocationOption: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  locationName: { color: '#1e293b', fontSize: 14, fontWeight: '700' },
  selectedLocationName: { color: '#1d4ed8' },
  locationDetail: { marginTop: 2, color: '#64748b', fontSize: 12 },
  locationHelp: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  manualLocationButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, backgroundColor: '#fff7ed' },
  selectedManualLocation: { borderColor: '#c2410c', backgroundColor: '#ffedd5' },
  manualLocationText: { color: '#c2410c', fontSize: 14, fontWeight: '800' },
  manualLocationInput: { minHeight: 46, borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 12, color: '#0f172a', backgroundColor: '#ffffff' },
  readOnlyLocation: { minHeight: 46, justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#f1f5f9' },
  readOnlyLocationText: { color: '#475569', fontSize: 14 },
  readOnlyText: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  saveErrorBanner: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveErrorText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  mediaFieldWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  mediaLabel: {
    fontSize: 14,
    color: '#374151',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  doneButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  savingBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  savingText: {
    color: '#ffffff',
    fontSize: 12,
  },
  ansulQuestion: {
    backgroundColor: '#ffffff',
  },
  ansulTechnicalRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  ansulTechnicalField: {
    flex: 1,
    minWidth: 0,
  },
  ansulTechnicalLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 5,
  },
  ansulTechnicalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  ansulStatus: {
    marginTop: 4,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
});
