import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  MAX_EXTINGUISHERS,
  isExtinguisherComplete,
  normalizeExtinguisherCollection,
} from '../../../lib/extinguishers';
import { parseFormData } from '../../../lib/form-data';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { getPhotosForItem, requestPhotoDeletion } from '../../../lib/repositories/photos.repo';
import { deletePhotoFiles } from '../../../lib/photo-manager';
import { ExtinguisherCollection, ExtinguisherRecord } from '../../../types/extinguisher.types';
import { Inspection } from '../../../types/inspection.types';

export default function ExtinguishersScreen() {
  const { id, readonly } = useLocalSearchParams<{ id: string; readonly?: string }>();
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [collection, setCollection] = useState<ExtinguisherCollection>({ items: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const current = await getInspection(id);
      if (!current) {
        Alert.alert('Error', 'No se encontró la inspección.');
        router.back();
        return;
      }
      const fullData = parseFormData(current);
      const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
      const normalized = normalizeExtinguisherCollection(pumps.extintores);

      if (normalized.changed) {
        const nextFormData = JSON.stringify({
          ...fullData,
          pumps: { ...pumps, extintores: normalized.collection },
        });
        await updateInspection(id, { form_data: nextFormData });
        current.form_data = nextFormData;
      }

      setInspection(current);
      setCollection(normalized.collection);
    } catch (error) {
      console.error('[extinguishers] Failed to load:', error);
      Alert.alert('Error', 'No se pudieron cargar los extintores.');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const locked = readonly === '1' || inspection?.status === 'completed' || inspection?.status === 'mail_composer_opened' || inspection?.status === 'sent';

  function openEditor(itemId: string) {
    router.push({
      pathname: '/inspection/[id]/extinguisher-editor',
      params: { id, itemId, ...(locked ? { readonly: '1' } : {}) },
    });
  }

  function addExtinguisher() {
    if (collection.items.length >= MAX_EXTINGUISHERS) {
      Alert.alert('Límite alcanzado', `Esta plantilla admite un máximo de ${MAX_EXTINGUISHERS} extintores.`);
      return;
    }
    openEditor('new');
  }

  function confirmDelete(item: ExtinguisherRecord) {
    if (isDeleting) return;
    Alert.alert(
      'Eliminar extintor',
      `¿Estás seguro de que quieres eliminar el extintor ${item.numero || 'sin número'}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (isDeleting) return;
            try {
              setIsDeleting(true);
              const current = await getInspection(id);
              if (!current) throw new Error('INSPECTION_NOT_FOUND');
              const fullData = parseFormData(current);
              const pumps = (fullData.pumps ?? {}) as Record<string, unknown>;
              const normalized = normalizeExtinguisherCollection(pumps.extintores);
              const nextCollection = {
                items: normalized.collection.items.filter((record) => record.id !== item.id),
              };
              await updateInspection(id, {
                form_data: JSON.stringify({
                  ...fullData,
                  pumps: { ...pumps, extintores: nextCollection },
                }),
              });
              for (const photo of await getPhotosForItem(id, 'extintores', item.id)) {
                const outcome = await requestPhotoDeletion(photo);
                if (outcome === 'deleted_local') await deletePhotoFiles(photo.local_uri, photo.thumbnail_uri);
              }
              setCollection(nextCollection);
            } catch (error) {
              console.error('[extinguishers] Failed to delete:', error);
              Alert.alert('Error', 'No se pudo eliminar el extintor.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={collection.items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Extintores capturados</Text>
            <Text style={styles.counter}>
              {collection.items.length} de {MAX_EXTINGUISHERS}
            </Text>
          </View>
          {!locked && (
            <TouchableOpacity
              style={[
                styles.addButton,
                collection.items.length >= MAX_EXTINGUISHERS && styles.disabledButton,
              ]}
              onPress={addExtinguisher}
              accessibilityRole="button"
              accessibilityLabel="Agregar extintor"
              activeOpacity={0.78}
            >
              <Ionicons name="add" size={20} color="#ffffff" />
              <Text style={styles.addButtonText}>Agregar extintor</Text>
            </TouchableOpacity>
          )}
          {locked && <Text style={styles.readOnly}>Vista de solo lectura</Text>}
        </View>
      )}
      ListEmptyComponent={(
        <View style={styles.emptyState}>
          <Ionicons name="flame-outline" size={34} color="#94a3b8" />
          <Text style={styles.emptyTitle}>Aún no hay extintores</Text>
          <Text style={styles.emptyText}>Agrega el primer equipo para comenzar la inspección.</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const complete = isExtinguisherComplete(item);
        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openEditor(item.id)}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`Extintor ${item.numero || 'sin número'}, ${complete ? 'completo' : 'incompleto'}`}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="flame" size={20} color="#d62828" />
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>Extintor {item.numero || 'sin número'}</Text>
                <View style={[styles.badge, complete ? styles.completeBadge : styles.incompleteBadge]}>
                  <Text style={[styles.badgeText, complete ? styles.completeText : styles.incompleteText]}>
                    {complete ? 'Completo' : 'Incompleto'}
                  </Text>
                </View>
              </View>
              <Text style={styles.location} numberOfLines={2}>{item.ubicacion || 'Sin ubicación'}</Text>
              <Text style={styles.details}>
                {[item.tipo_extintor, item.capacidad].filter(Boolean).join(' · ') || 'Sin tipo ni capacidad'}
              </Text>
            </View>
            {!locked && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={(event) => {
                  event.stopPropagation();
                  confirmDelete(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Eliminar extintor ${item.numero || 'sin número'}`}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
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
  header: { gap: 12, paddingBottom: 6 },
  headerCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { color: '#1f3f66', fontSize: 22, fontWeight: '800' },
  counter: { color: '#64748b', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  addButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#1f3f66', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  disabledButton: { opacity: 0.45 },
  addButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  readOnly: { color: '#92400e', fontSize: 13, fontWeight: '700' },
  emptyState: { minHeight: 220, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 7, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTitle: { color: '#334155', fontSize: 16, fontWeight: '800' },
  emptyText: { color: '#64748b', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  card: { minHeight: 92, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)' },
  cardIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0, gap: 3 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { flex: 1, color: '#1f2937', fontSize: 15, fontWeight: '800' },
  location: { color: '#475569', fontSize: 13, lineHeight: 18 },
  details: { color: '#64748b', fontSize: 12 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  completeBadge: { backgroundColor: '#dcfce7' },
  incompleteBadge: { backgroundColor: '#ffedd5' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  completeText: { color: '#15803d' },
  incompleteText: { color: '#b45309' },
  deleteButton: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
});
