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
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocalSearchParams, useRouter } from 'expo-router';
import EquipmentEvidenceField from '../../../components/forms/EquipmentEvidenceField';
import {
  ALARM_DEVICE_KEYS,
  ALARM_FORM_LABELS,
  MAX_ALARM_DEVICES,
  createEmptyAlarmDevice,
  deriveDeviceStatus,
  hasAnyAlarmDeviceData,
  isAlarmDeviceComplete,
  normalizeAlarmsData,
} from '../../../lib/alarms';
import { getSiteData, parseFormData } from '../../../lib/form-data';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { generateId } from '../../../lib/uuid';
import { tableroAdForm } from '../../../schemas';
import { getLocationsByBranch, getLocationsByCompany } from '../../../services/catalog-sync';
import {
  AlarmCheckValue,
  AlarmDeviceItem,
  AlarmMobileFormId,
  AlarmServerFormType,
} from '../../../types/alarm.types';
import { CatalogEquipmentType, CatalogLocation } from '../../../types/catalog.types';

type DeviceMobileId = Exclude<AlarmMobileFormId, 'tablero_ad'>;

const FORM_CONFIG: Record<DeviceMobileId, {
  identifierLabel: string;
  equipmentType: CatalogEquipmentType;
  serverFormType: Exclude<AlarmServerFormType, 'alarm_panel'>;
}> = {
  dispositivos_ad: {
    identifierLabel: 'Dirección',
    equipmentType: 'addressed_device',
    serverFormType: 'addressed_devices',
  },
  dispositivos_convencionales: {
    identifierLabel: 'Módulo',
    equipmentType: 'conventional_device',
    serverFormType: 'conventional_devices',
  },
  dispositivos_notificacion: {
    identifierLabel: 'Módulo',
    equipmentType: 'notification_device',
    serverFormType: 'notification_devices',
  },
};

function isDeviceForm(value: string | undefined): value is DeviceMobileId {
  return value === 'dispositivos_ad' || value === 'dispositivos_convencionales'
    || value === 'dispositivos_notificacion';
}

export default function AlarmDeviceEditorScreen() {
  const { id, form, itemId = 'new', readonly } = useLocalSearchParams<{
    id: string;
    form?: string;
    itemId?: string;
    readonly?: string;
  }>();
  const router = useRouter();
  const formId = isDeviceForm(form) ? form : null;
  const [recordId] = useState(() => itemId === 'new' ? generateId() : itemId);
  const [loading, setLoading] = useState(true);
  const [readOnly, setReadOnly] = useState(readonly === '1');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const loadedRef = useRef(false);
  const readOnlyRef = useRef(readonly === '1');
  const createdAtRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<AlarmDeviceItem | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const { control, reset, getValues, setValue } = useForm<AlarmDeviceItem>({
    defaultValues: createEmptyAlarmDevice(recordId),
  });
  const values = useWatch({ control }) as AlarmDeviceItem;

  useEffect(() => {
    async function load() {
      if (!formId) {
        Alert.alert('Error', 'Formulario de Alarmas no reconocido.');
        router.back();
        return;
      }
      try {
        const inspection = await getInspection(id);
        if (!inspection) throw new Error('INSPECTION_NOT_FOUND');
        const locked = readonly === '1' || inspection.status === 'completed'
          || inspection.status === 'mail_composer_opened' || inspection.status === 'sent';
        setReadOnly(locked);
        readOnlyRef.current = locked;
        const fullData = parseFormData(inspection);
        const normalized = normalizeAlarmsData(fullData, tableroAdForm);
        if (normalized.changed) {
          await updateInspection(id, {
            form_data: JSON.stringify({ ...fullData, alarms: normalized.data }),
          });
        }
        const collection = normalized.data[ALARM_DEVICE_KEYS[formId]];
        const existing = collection.items.find((item) => item.id === recordId);
        if (itemId !== 'new' && !existing) throw new Error('DEVICE_NOT_FOUND');
        const initial = existing ?? createEmptyAlarmDevice(recordId);
        createdAtRef.current = initial.createdAt;
        reset(initial);

        const site = getSiteData(inspection);
        if (site.companyId) {
          const config = FORM_CONFIG[formId];
          setLocations(site.branchId
            ? await getLocationsByBranch(site.branchId, config.equipmentType)
            : await getLocationsByCompany(site.companyId, config.equipmentType));
        }
        loadedRef.current = true;
      } catch (error) {
        console.error('[alarm-device-editor] Load failed:', error);
        Alert.alert('Error', 'No se pudo cargar el dispositivo.');
        router.back();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [formId, id, itemId, readonly, recordId, reset, router]);

  const persist = useCallback(async (snapshot: AlarmDeviceItem) => {
    if (!formId || readOnlyRef.current || !hasAnyAlarmDeviceData(snapshot)) return;
    const inspection = await getInspection(id);
    if (!inspection) throw new Error('INSPECTION_NOT_FOUND');
    const fullData = parseFormData(inspection);
    const normalized = normalizeAlarmsData(fullData, tableroAdForm);
    const key = ALARM_DEVICE_KEYS[formId];
    const collection = normalized.data[key];
    const index = collection.items.findIndex((item) => item.id === recordId);
    if (index < 0 && collection.items.length >= MAX_ALARM_DEVICES) {
      throw new Error('ALARM_DEVICE_LIMIT');
    }
    const nextItem: AlarmDeviceItem = {
      ...createEmptyAlarmDevice(recordId, createdAtRef.current),
      ...snapshot,
      id: recordId,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
    };
    const nextItems = [...collection.items];
    if (index >= 0) nextItems[index] = nextItem;
    else nextItems.push(nextItem);
    const nextCollection = { ...collection, items: nextItems, updatedAt: Date.now() };
    normalized.data[key] = {
      ...nextCollection,
      status: deriveDeviceStatus(nextCollection),
    };
    await updateInspection(id, {
      form_data: JSON.stringify({ ...fullData, alarms: normalized.data }),
    });
  }, [formId, id, recordId]);

  const queueSave = useCallback((snapshot: AlarmDeviceItem) => {
    const operation = saveQueueRef.current.then(() => persist({ ...snapshot }));
    saveQueueRef.current = operation.catch(() => {});
    return operation;
  }, [persist]);

  useEffect(() => {
    if (!loadedRef.current || readOnly) return;
    pendingRef.current = values;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        setSaving(true);
        setSaveError(null);
        await queueSave(values);
        if (pendingRef.current === values) pendingRef.current = null;
      } catch (error) {
        console.error('[alarm-device-editor] Autosave failed:', error);
        setSaveError('No se pudieron guardar los cambios.');
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [queueSave, readOnly, values]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current && !readOnlyRef.current) {
      queueSave(pendingRef.current).catch(console.error);
    }
  }, [queueSave]);

  const filteredLocations = useMemo(() => {
    const term = locationSearch.trim().toLocaleLowerCase('es-MX');
    if (!term) return locations;
    return locations.filter((location) =>
      [location.name, location.area, location.floor, location.reference]
        .some((value) => value.toLocaleLowerCase('es-MX').includes(term))
    );
  }, [locationSearch, locations]);

  async function saveAndBack() {
    if (readOnly) {
      router.back();
      return;
    }
    const snapshot = getValues();
    if (!hasAnyAlarmDeviceData(snapshot)) {
      Alert.alert('Sin datos', 'Captura al menos un dato antes de guardar.');
      return;
    }
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaving(true);
      await queueSave(snapshot);
      pendingRef.current = null;
      router.back();
    } catch (error) {
      Alert.alert(
        error instanceof Error && error.message === 'ALARM_DEVICE_LIMIT' ? 'Límite alcanzado' : 'Error',
        error instanceof Error && error.message === 'ALARM_DEVICE_LIMIT'
          ? `Esta plantilla admite un máximo de ${MAX_ALARM_DEVICES} dispositivos.`
          : 'No se pudo guardar el dispositivo.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || !formId) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#6d28d9" /></View>;
  }
  const config = FORM_CONFIG[formId];
  const complete = isAlarmDeviceComplete(values);

  function checkField(name: 'alarm' | 'supervision' | 'cleaning', label: string) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.checkRow}>
              {([
                ['si', 'Sí'],
                ['na', 'N/A'],
                ['no', 'No'],
              ] as Array<[Exclude<AlarmCheckValue, ''>, string]>).map(([candidate, textLabel]) => (
                <TouchableOpacity
                  key={candidate}
                  style={[styles.checkButton, value === candidate && styles.selectedCheck]}
                  disabled={readOnly}
                  onPress={() => onChange(candidate)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: value === candidate }}
                >
                  <Text style={[styles.checkText, value === candidate && styles.selectedCheckText]}>{textLabel}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />
    );
  }

  function textField(name: 'identifier' | 'loop' | 'deviceType' | 'observations', label: string, multiline = false) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={[styles.input, multiline && styles.multiline]}
              editable={!readOnly}
              value={value}
              onChangeText={onChange}
              multiline={multiline}
              placeholder={`Captura ${label.toLocaleLowerCase('es-MX')}`}
              placeholderTextColor="#94a3b8"
            />
          </View>
        )}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.summary}>
        <Text style={styles.title}>{ALARM_FORM_LABELS[formId]}</Text>
        <Text style={[styles.status, complete ? styles.complete : styles.incomplete]}>
          {complete ? 'Completo' : 'Incompleto'}
        </Text>
        {saving && <Text style={styles.saving}>Guardando…</Text>}
        {saveError && <Text style={styles.error}>{saveError}</Text>}
      </View>

      <View style={styles.section}>
        {textField('identifier', config.identifierLabel)}
        {textField('loop', 'Loop')}
        {textField('deviceType', 'Dispositivo')}
        <View style={styles.field}>
          <Text style={styles.label}>Ubicación</Text>
          {!readOnly && locations.length > 0 && (
            <>
              <TextInput
                style={styles.input}
                value={locationSearch}
                onChangeText={setLocationSearch}
                placeholder="Buscar ubicación"
                placeholderTextColor="#94a3b8"
              />
              <View style={styles.locationOptions}>
                {filteredLocations.map((location) => {
                  const selected = values.locationId === location.id && !values.customLocation;
                  return (
                    <TouchableOpacity
                      key={location.id}
                      style={[styles.location, selected && styles.selectedLocation]}
                      onPress={() => {
                        setValue('locationId', location.id, { shouldDirty: true });
                        setValue('locationNameSnapshot', location.name, { shouldDirty: true });
                        setValue('customLocation', false, { shouldDirty: true });
                      }}
                    >
                      <Text style={styles.locationName}>{location.name}</Text>
                      {!![location.area, location.floor].filter(Boolean).length && (
                        <Text style={styles.locationDetail}>{[location.area, location.floor].filter(Boolean).join(' · ')}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
          {!readOnly && (
            <TouchableOpacity
              style={[styles.manualButton, values.customLocation && styles.selectedManual]}
              onPress={() => {
                setValue('locationId', null, { shouldDirty: true });
                setValue('customLocation', true, { shouldDirty: true });
              }}
            >
              <Text style={styles.manualText}>+ Usar otra ubicación</Text>
            </TouchableOpacity>
          )}
          {(values.customLocation || readOnly) && (
            <TextInput
              style={styles.input}
              editable={!readOnly}
              value={values.locationNameSnapshot}
              onChangeText={(value) => {
                setValue('locationId', null, { shouldDirty: true });
                setValue('customLocation', true, { shouldDirty: true });
                setValue('locationNameSnapshot', value, { shouldDirty: true });
              }}
              placeholder="Escribe la ubicación"
              placeholderTextColor="#94a3b8"
            />
          )}
          {!locations.length && !values.customLocation && !readOnly && (
            <Text style={styles.help}>No hay ubicaciones en el catálogo. Usa una ubicación manual.</Text>
          )}
        </View>
        {checkField('alarm', 'Alarma')}
        {checkField('supervision', 'Supervisión')}
        {checkField('cleaning', 'Limpieza')}
        {textField('observations', 'Comentarios / observaciones', true)}
      </View>

      <EquipmentEvidenceField
        inspectionId={id}
        formatType="alarms"
        formType={config.serverFormType}
        itemId={recordId}
        locationNameSnapshot={values.locationNameSnapshot}
        readOnly={readOnly}
        beforeCapture={() => queueSave(getValues())}
        canCapture={hasAnyAlarmDeviceData(values)}
      />

      <TouchableOpacity style={styles.saveButton} disabled={saving} onPress={saveAndBack}>
        <Text style={styles.saveText}>{readOnly ? 'Volver' : 'Guardar y volver'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingBottom: 40, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, backgroundColor: '#ffffff', padding: 14, gap: 7 },
  title: { color: '#3b176d', fontSize: 20, fontWeight: '800' },
  status: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  complete: { color: '#15803d', backgroundColor: '#dcfce7' },
  incomplete: { color: '#b45309', backgroundColor: '#ffedd5' },
  saving: { color: '#6d28d9', fontSize: 12, fontWeight: '700' },
  error: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  section: { backgroundColor: '#ffffff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingVertical: 4 },
  field: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, color: '#0f172a', backgroundColor: '#ffffff' },
  multiline: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', gap: 8 },
  checkButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  selectedCheck: { borderColor: '#6d28d9', backgroundColor: '#f3e8ff' },
  checkText: { color: '#475569', fontWeight: '700' },
  selectedCheckText: { color: '#5b21b6' },
  locationOptions: { gap: 7 },
  location: { minHeight: 48, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, backgroundColor: '#f8fafc' },
  selectedLocation: { borderColor: '#6d28d9', backgroundColor: '#f3e8ff' },
  locationName: { color: '#1e293b', fontWeight: '700' },
  locationDetail: { color: '#64748b', fontSize: 12, marginTop: 2 },
  manualButton: { minHeight: 46, borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff7ed' },
  selectedManual: { borderColor: '#c2410c', backgroundColor: '#ffedd5' },
  manualText: { color: '#c2410c', fontWeight: '800' },
  help: { color: '#64748b', fontSize: 12 },
  saveButton: { minHeight: 52, marginHorizontal: 16, marginTop: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6d28d9' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
