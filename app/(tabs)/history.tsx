import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { InspectionListItem, InspectionStatus } from '../../types/inspection.types';
import {
  deleteInspectionCompletely,
  getInspectionsForList,
  setInspectionPinned,
  updateStatus,
} from '../../lib/repositories/inspections.repo';
import InspectionCard from '../../components/ui/InspectionCard';
import PendingInspectionCard from '../../components/ui/PendingInspectionCard';
import PendingCommentDialog from '../../components/ui/PendingCommentDialog';

type FilterOption = 'all' | InspectionStatus;

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'draft', label: 'Borrador' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'completed', label: 'Por enviar' },
  { key: 'mail_composer_opened', label: 'Correo abierto' },
  { key: 'sent', label: 'Enviadas' },
];

export default function HistoryScreen() {
  const router = useRouter();
  const [inspections, setInspections] = useState<InspectionListItem[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<InspectionListItem | null>(null);
  const [pendingComment, setPendingComment] = useState('');
  const [isMarkingPending, setIsMarkingPending] = useState(false);
  const deletingIds = useRef(new Set<string>());

  async function loadInspections() {
    try {
      const all = await getInspectionsForList({
        statuses: filter === 'all' ? undefined : [filter],
        prioritizePinned: true,
      });
      setInspections(all);
      setOpenCardId(null);
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
    }, [filter])
  );

  const filtered = inspections;

  function handlePress(inspection: InspectionListItem) {
    // All inspections open their index screen (the list of pumps + share).
    router.push(`/inspection/${inspection.id}`);
  }

  function sortInspections(items: InspectionListItem[]): InspectionListItem[] {
    return [...items].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updated_at - left.updated_at;
    });
  }

  async function handleDelete(inspection: InspectionListItem) {
    if (deletingIds.current.has(inspection.id)) return;
    deletingIds.current.add(inspection.id);

    try {
      await deleteInspectionCompletely(inspection.id, inspection.status);
      setInspections((current) => current.filter((item) => item.id !== inspection.id));
    } catch (error) {
      console.error('[history] Failed to delete editable inspection:', error);
      Alert.alert(
        'No se pudo eliminar',
        'El formulario se conservó. Intenta eliminarlo nuevamente.'
      );
    } finally {
      deletingIds.current.delete(inspection.id);
    }
  }

  function confirmDelete(inspection: InspectionListItem) {
    if (
      !['draft', 'pending'].includes(inspection.status) ||
      deletingIds.current.has(inspection.id)
    ) return;
    setOpenCardId(null);
    const statusLabel = inspection.status === 'draft' ? 'borrador' : 'pendiente';
    Alert.alert(
      'Eliminar formulario',
      `¿Estás seguro de que quieres eliminar este formulario ${statusLabel}?\nEsta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setOpenCardId(null) },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void handleDelete(inspection);
          },
        },
      ]
    );
  }

  async function togglePinned(inspection: InspectionListItem) {
    if (!['draft', 'pending'].includes(inspection.status)) return;
    setOpenCardId(null);

    try {
      const pinned = !inspection.pinned;
      await setInspectionPinned(inspection.id, pinned);
      setInspections((current) =>
        sortInspections(
          current.map((item) => (item.id === inspection.id ? { ...item, pinned } : item))
        )
      );
    } catch (error) {
      console.error('[history] Failed to update pinned inspection:', error);
      Alert.alert('No se pudo actualizar', 'Intenta fijar o desfijar el formulario nuevamente.');
    }
  }

  function requestMarkPending(inspection: InspectionListItem) {
    if (inspection.status !== 'draft') return;
    setOpenCardId(null);
    setPendingComment('');
    setPendingTarget(inspection);
  }

  function closePendingDialog() {
    if (isMarkingPending) return;
    setPendingTarget(null);
    setPendingComment('');
  }

  async function markAsPending() {
    if (!pendingTarget || isMarkingPending) return;
    const comment = pendingComment.trim();
    if (!comment) return;

    try {
      setIsMarkingPending(true);
      await updateStatus(pendingTarget.id, 'pending', comment);
      const updatedAt = Date.now();
      setInspections((current) => {
        if (filter === 'draft') {
          return current.filter((item) => item.id !== pendingTarget.id);
        }
        return sortInspections(
          current.map((item) =>
            item.id === pendingTarget.id
              ? {
                  ...item,
                  status: 'pending' as const,
                  pending_comment: comment,
                  updated_at: updatedAt,
                }
              : item
          )
        );
      });
      setPendingTarget(null);
      setPendingComment('');
    } catch (error) {
      console.error('[history] Failed to mark draft as pending:', error);
      Alert.alert('No se pudo actualizar', 'El borrador se conservó. Intenta nuevamente.');
    } finally {
      setIsMarkingPending(false);
    }
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
          renderItem={({ item }) =>
            item.status === 'pending' || item.status === 'draft' ? (
              <PendingInspectionCard
                inspection={item}
                openCardId={openCardId}
                onOpenCard={setOpenCardId}
                onPress={() => {
                  setOpenCardId(null);
                  handlePress(item);
                }}
                onRequestDelete={() => confirmDelete(item)}
                onTogglePinned={() => {
                  void togglePinned(item);
                }}
                onMarkPending={
                  item.status === 'draft' ? () => requestMarkPending(item) : undefined
                }
              />
            ) : (
              <InspectionCard inspection={item} onPress={() => handlePress(item)} />
            )
          }
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          onScrollBeginDrag={() => setOpenCardId(null)}
          showsVerticalScrollIndicator={false}
        />
      )}

      <PendingCommentDialog
        visible={Boolean(pendingTarget)}
        comment={pendingComment}
        isSaving={isMarkingPending}
        onChangeComment={setPendingComment}
        onCancel={closePendingDialog}
        onConfirm={() => {
          void markAsPending();
        }}
      />
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
