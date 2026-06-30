import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { InspectionListItem, InspectionStatus } from '../../types/inspection.types';
import { getInspectionsForList } from '../../lib/repositories/inspections.repo';
import InspectionCard from '../../components/ui/InspectionCard';

type FilterOption = 'all' | InspectionStatus;

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'draft', label: 'Borrador' },
  { key: 'completed', label: 'Por enviar' },
  { key: 'sent', label: 'Enviadas' },
];

export default function HistoryScreen() {
  const router = useRouter();
  const [inspections, setInspections] = useState<InspectionListItem[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [isLoading, setIsLoading] = useState(true);

  async function loadInspections() {
    try {
      const all = await getInspectionsForList();
      setInspections(all);
    } catch (error) {
      console.error('[history] Failed to load inspections:', error);
    } finally {
      setIsLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadInspections();
    }, [])
  );

  const filtered =
    filter === 'all' ? inspections : inspections.filter((i) => i.status === filter);

  function handlePress(inspection: InspectionListItem) {
    // All inspections open their index screen (the list of pumps + share).
    router.push(`/inspection/${inspection.id}`);
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Sin inspecciones</Text>
          <Text style={styles.emptySubtext}>
            {filter === 'all'
              ? 'Aún no has realizado ninguna inspección.'
              : 'No hay inspecciones con este filtro.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InspectionCard inspection={item} onPress={() => handlePress(item)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    backgroundColor: '#1e3a5f',
    borderColor: '#1e3a5f',
  },
  filterLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  filterLabelActive: {
    color: '#ffffff',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
});
