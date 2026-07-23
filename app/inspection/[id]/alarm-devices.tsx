import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ALARM_DEVICE_KEYS,
  ALARM_FORM_LABELS,
  MAX_ALARM_DEVICES,
  isAlarmDeviceComplete,
  normalizeAlarmsData,
} from '../../../lib/alarms';
import { parseFormData } from '../../../lib/form-data';
import { deletePhotoFiles } from '../../../lib/photo-manager';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { getPhotosForItem, requestPhotoDeletion } from '../../../lib/repositories/photos.repo';
import { tableroAdForm } from '../../../schemas';
import { AlarmDeviceItem, AlarmMobileFormId } from '../../../types/alarm.types';
import { Inspection } from '../../../types/inspection.types';

type DeviceMobileId = Exclude<AlarmMobileFormId, 'tablero_ad'>;

function isDeviceForm(value: string | undefined): value is DeviceMobileId {
  return value === 'dispositivos_ad' || value === 'dispositivos_convencionales'
    || value === 'dispositivos_notificacion';
}

export default function AlarmDevicesScreen() {
  const { id, form, readonly } = useLocalSearchParams<{
    id: string;
    form?: string;
    readonly?: string;
  }>();
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [items, setItems] = useState<AlarmDeviceItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const formId = isDeviceForm(form) ? form : null;

  const load = useCallback(async () => {
    if (!formId) {
      Alert.alert('Error', 'Formulario de Alarmas no reconocido.');
      router.back();
      return;
    }
    try {
      const current = await getInspection(id);
      if (!current) throw new Error('INSPECTION_NOT_FOUND');
      const fullData = parseFormData(current);
      const normalized = normalizeAlarmsData(fullData, tableroAdForm);
      if (normalized.changed) {
        const next = JSON.stringify({ ...fullData, alarms: normalized.data });
        await updateInspection(id, { form_data: next });
        current.form_data = next;
      }
      setInspection(current);
      setItems(normalized.data[ALARM_DEVICE_KEYS[formId]].items);
    } catch (error) {
      console.error('[alarm-devices] Load failed:', error);
      Alert.alert('Error', 'No se pudieron cargar los dispositivos.');
    } finally {
      setLoading(false);
    }
  }, [formId, id, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const locked = readonly === '1' || inspection?.status === 'completed'
    || inspection?.status === 'mail_composer_opened' || inspection?.status === 'sent';
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-MX');
    if (!term) return items;
    return items.filter((item) =>
      [item.identifier, item.loop, item.deviceType, item.locationNameSnapshot]
        .some((value) => value.toLocaleLowerCase('es-MX').includes(term))
    );
  }, [items, search]);

  function openEditor(itemId: string) {
    router.push(`/inspection/${id}/alarm-device-editor?form=${formId}&itemId=${itemId}${locked ? '&readonly=1' : ''}`);
  }

  function addDevice() {
    if (items.length >= MAX_ALARM_DEVICES) {
      Alert.alert('Límite alcanzado', `Esta plantilla admite un máximo de ${MAX_ALARM_DEVICES} dispositivos.`);
      return;
    }
    openEditor('new');
  }

  function confirmDelete(item: AlarmDeviceItem) {
    if (!formId || deleting) return;
    Alert.alert(
      'Eliminar dispositivo',
      '¿Estás seguro de que quieres eliminar este dispositivo? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (deleting) return;
            try {
              setDeleting(true);
              const current = await getInspection(id);
              if (!current) throw new Error('INSPECTION_NOT_FOUND');
              const fullData = parseFormData(current);
              const normalized = normalizeAlarmsData(fullData, tableroAdForm);
              const key = ALARM_DEVICE_KEYS[formId];
              const collection = normalized.data[key];
              normalized.data[key] = {
                ...collection,
                items: collection.items.filter((candidate) => candidate.id !== item.id),
                status: 'in_progress',
                updatedAt: Date.now(),
              };
              await updateInspection(id, {
                form_data: JSON.stringify({ ...fullData, alarms: normalized.data }),
              });
              for (const photo of await getPhotosForItem(id, 'alarms', item.id)) {
                const outcome = await requestPhotoDeletion(photo);
                if (outcome === 'deleted_local') {
                  await deletePhotoFiles(photo.local_uri, photo.thumbnail_uri);
                }
              }
              setItems((currentItems) => currentItems.filter((candidate) => candidate.id !== item.id));
            } catch (error) {
              console.error('[alarm-devices] Delete failed:', error);
              Alert.alert('Error', 'No se pudo eliminar el dispositivo.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (loading || !formId) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#6d28d9" /></View>;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={filtered}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>{ALARM_FORM_LABELS[formId]}</Text>
              <Text style={styles.counter}>{items.length} de {MAX_ALARM_DEVICES}</Text>
            </View>
            {!locked && (
              <TouchableOpacity style={styles.addButton} onPress={addDevice} accessibilityLabel="Agregar dispositivo">
                <Ionicons name="add" size={20} color="#ffffff" />
                <Text style={styles.addText}>Agregar</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por identificación, tipo o ubicación"
            placeholderTextColor="#94a3b8"
          />
          {locked && <Text style={styles.readOnly}>Vista de solo lectura</Text>}
        </View>
      )}
      ListEmptyComponent={(
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={34} color="#a78bfa" />
          <Text style={styles.emptyTitle}>{search ? 'Sin resultados' : 'Aún no hay dispositivos'}</Text>
          <Text style={styles.emptyText}>{search ? 'Prueba con otra búsqueda.' : 'Agrega el primer dispositivo para comenzar.'}</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const complete = isAlarmDeviceComplete(item);
        return (
          <TouchableOpacity style={styles.card} onPress={() => openEditor(item.id)} activeOpacity={0.72}>
            <View style={styles.icon}><Ionicons name="radio-outline" size={21} color="#6d28d9" /></View>
            <View style={styles.cardBody}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.identifier || 'Sin identificación'}</Text>
                <Text style={[styles.badge, complete ? styles.complete : styles.incomplete]}>
                  {complete ? 'Completo' : 'Incompleto'}
                </Text>
              </View>
              <Text style={styles.cardText}>{item.deviceType || 'Sin tipo'} · Loop {item.loop || '—'}</Text>
              <Text style={styles.cardText} numberOfLines={2}>{item.locationNameSnapshot || 'Sin ubicación'}</Text>
            </View>
            {!locked && (
              <TouchableOpacity style={styles.delete} onPress={() => confirmDelete(item)} accessibilityLabel="Eliminar dispositivo">
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={19} color="#94a3b8" />
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: 12, paddingBottom: 5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  title: { color: '#3b176d', fontSize: 20, fontWeight: '800' },
  counter: { color: '#64748b', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  addButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 14, backgroundColor: '#6d28d9', flexDirection: 'row', alignItems: 'center', gap: 5 },
  addText: { color: '#ffffff', fontWeight: '800' },
  search: { minHeight: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 13, backgroundColor: '#ffffff', color: '#0f172a' },
  readOnly: { color: '#92400e', fontSize: 12, fontWeight: '700' },
  empty: { minHeight: 220, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 24 },
  emptyTitle: { color: '#334155', fontSize: 16, fontWeight: '800' },
  emptyText: { color: '#64748b', textAlign: 'center' },
  card: { minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, boxShadow: '0 2px 8px rgba(15,23,42,0.05)' },
  icon: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0, gap: 3 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { flex: 1, color: '#1e293b', fontSize: 15, fontWeight: '800' },
  cardText: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  badge: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, fontSize: 10, fontWeight: '800' },
  complete: { color: '#15803d', backgroundColor: '#dcfce7' },
  incomplete: { color: '#b45309', backgroundColor: '#ffedd5' },
  delete: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
});
