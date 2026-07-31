import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { InspectionListItem } from '../../types/inspection.types';
import {
  deleteInspectionCompletely,
  getInspectionsForList,
  getInspectionCounts,
  setInspectionPinned,
  updateStatus,
} from '../../lib/repositories/inspections.repo';
import { loadSettings } from '../../lib/settings-manager';
import InspectionCard from '../../components/ui/InspectionCard';
import PendingInspectionCard from '../../components/ui/PendingInspectionCard';
import PendingCommentDialog from '../../components/ui/PendingCommentDialog';

interface Stats {
  pending: number;
}

function formatToday(): string {
  return new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const [recent, setRecent] = useState<InspectionListItem[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0 });
  const [technicianName, setTechnicianName] = useState('');
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<InspectionListItem | null>(null);
  const [pendingComment, setPendingComment] = useState('');
  const [isMarkingPending, setIsMarkingPending] = useState(false);
  const deletingIds = useRef(new Set<string>());

  const loadDashboard = useCallback(async () => {
    try {
      const [latest, counts, settings] = await Promise.all([
        getInspectionsForList({ limit: 5, prioritizePinned: true }),
        getInspectionCounts(),
        loadSettings(),
      ]);
      setRecent(latest);
      setStats({ pending: counts.draft + counts.pending });
      setTechnicianName(settings.technicianName);
      setOpenCardId(null);
    } catch (error) {
      console.error('[dashboard] Failed to load dashboard:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard])
  );

  function handleCardPress(inspection: InspectionListItem) {
    router.push(`/inspection/${inspection.id}`);
  }

  async function handleDelete(inspection: InspectionListItem) {
    if (deletingIds.current.has(inspection.id)) return;
    deletingIds.current.add(inspection.id);
    try {
      await deleteInspectionCompletely(inspection.id, inspection.status);
      await loadDashboard();
    } catch (error) {
      console.error('[dashboard] Failed to delete editable inspection:', error);
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
      await setInspectionPinned(inspection.id, !inspection.pinned);
      await loadDashboard();
    } catch (error) {
      console.error('[dashboard] Failed to update pinned inspection:', error);
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
      setPendingTarget(null);
      setPendingComment('');
      await loadDashboard();
    } catch (error) {
      console.error('[dashboard] Failed to mark draft as pending:', error);
      Alert.alert('No se pudo actualizar', 'El borrador se conservó. Intenta nuevamente.');
    } finally {
      setIsMarkingPending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" backgroundColor="#1f3f66" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        onScrollBeginDrag={() => setOpenCardId(null)}
      >
      <LinearGradient
        colors={['#1f3f66', '#d62828']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Text style={styles.brand}>ExtinCheck</Text>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{formatToday()}</Text>
          </View>
        </View>

        <Text style={styles.title}>Fuego & Seguridad</Text>
        <Text style={styles.subtitle}>Control digital de inspecciones contra incendio</Text>
      </LinearGradient>

      <View style={styles.welcomeWrap}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeTextBlock}>
            <Text style={styles.hello}>Hola</Text>
            <Text style={styles.technicianName} numberOfLines={1}>
              {technicianName || 'Tecnico'}
            </Text>
            <Text style={styles.role}>Tecnico de inspeccion</Text>
            <Text style={styles.note}>Inspecciones digitales de extintores</Text>
          </View>

          <View style={styles.avatar}>
            <Ionicons name="person" size={42} color="#1f3f66" />
          </View>
        </View>

        {stats.pending > 0 && (
          <TouchableOpacity
            style={styles.pendingTab}
            onPress={() => router.push('/history')}
            activeOpacity={0.75}
          >
            <Ionicons name="alert-circle" size={16} color="#c05621" />
            <Text style={styles.pendingText}>{stats.pending} pendientes</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.action, styles.primaryAction]}
          onPress={() => router.push('/inspection/new?format=bombas&source=dashboard_primary')}
          activeOpacity={0.82}
        >
          <Ionicons name="add-circle" size={22} color="#ffffff" />
          <Text style={styles.primaryActionText}>Nueva inspeccion</Text>
        </TouchableOpacity>

        <Text style={styles.quickTitle}>Acceso rápido</Text>

        <View style={styles.quickCardsRow}>
          <TouchableOpacity
            style={[styles.quickCard, isCompact && styles.quickCardCompact]}
            onPress={() =>
              router.push('/inspection/new?category=bombas&source=dashboard_bombas')
            }
            activeOpacity={0.78}
          >
            <View style={[styles.quickIcon, styles.pumpsIcon]}>
              <Text style={styles.pumpsLetter}>B</Text>
            </View>
            <Text style={[styles.quickCardTitle, isCompact && styles.quickCardTitleCompact]}>
              Bombas
            </Text>
            <Text style={[styles.quickCardSubtitle, isCompact && styles.quickCardSubtitleCompact]}>
              1, 2 o 3 equipos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, isCompact && styles.quickCardCompact]}
            onPress={() =>
              router.push('/inspection/new?category=alarmas&source=dashboard_alarmas')
            }
            activeOpacity={0.78}
          >
            <View style={[styles.quickIcon, styles.alarmsIcon]}>
              <Ionicons name="notifications" size={20} color="#7c3aed" />
            </View>
            <Text style={[styles.quickCardTitle, isCompact && styles.quickCardTitleCompact]}>
              Alarmas
            </Text>
            <Text style={[styles.quickCardSubtitle, isCompact && styles.quickCardSubtitleCompact]}>
              Ver sistemas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, isCompact && styles.quickCardCompact]}
            onPress={() => router.push('/inspection/new?category=all&source=dashboard_all')}
            activeOpacity={0.78}
          >
            <View style={[styles.quickIcon, styles.moreIcon]}>
              <Ionicons name="add" size={22} color="#ea580c" />
            </View>
            <Text style={[styles.quickCardTitle, isCompact && styles.quickCardTitleCompact]}>
              Más tipos
            </Text>
            <Text style={[styles.quickCardSubtitle, isCompact && styles.quickCardSubtitleCompact]}>
              Ver todas
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.sectionTitle}>
            <Text style={styles.recentTitle}>Inspecciones recientes</Text>
          </View>
          {recent.map((insp) =>
            insp.status === 'draft' || insp.status === 'pending' ? (
              <PendingInspectionCard
                key={insp.id}
                inspection={insp}
                openCardId={openCardId}
                onOpenCard={setOpenCardId}
                onPress={() => {
                  setOpenCardId(null);
                  handleCardPress(insp);
                }}
                onRequestDelete={() => confirmDelete(insp)}
                onTogglePinned={() => {
                  void togglePinned(insp);
                }}
                onMarkPending={
                  insp.status === 'draft' ? () => requestMarkPending(insp) : undefined
                }
              />
            ) : (
              <InspectionCard
                key={insp.id}
                inspection={insp}
                onPress={() => handleCardPress(insp)}
              />
            )
          )}
        </View>
      )}
      </ScrollView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1f3f66',
  },
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 38,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  dateBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 18,
  },
  subtitle: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 6,
    opacity: 0.92,
  },
  welcomeWrap: {
    marginHorizontal: 18,
    marginTop: -22,
    marginBottom: 18,
  },
  welcomeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  welcomeTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  hello: {
    color: '#6b7280',
    fontSize: 14,
  },
  technicianName: {
    marginTop: 4,
    color: '#1f3f66',
    fontSize: 24,
    fontWeight: '800',
  },
  role: {
    marginTop: 5,
    color: '#6b7280',
    fontSize: 14,
  },
  note: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f6f8',
    borderWidth: 3,
    borderColor: '#d62828',
  },
  pendingTab: {
    alignSelf: 'flex-start',
    marginLeft: 18,
    marginTop: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffedd5',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 8,
  },
  pendingText: {
    color: '#c05621',
    fontSize: 12,
    fontWeight: '800',
  },
  quickActions: {
    paddingHorizontal: 18,
    gap: 12,
    marginBottom: 22,
  },
  action: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 74,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryAction: {
    minHeight: 58,
    backgroundColor: '#1f3f66',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  quickTitle: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '800',
  },
  quickCardsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 3,
  },
  quickCardCompact: {
    paddingHorizontal: 8,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pumpsIcon: {
    backgroundColor: '#dbeafe',
  },
  alarmsIcon: {
    backgroundColor: '#ede9fe',
  },
  moreIcon: {
    backgroundColor: '#ffedd5',
  },
  pumpsLetter: {
    color: '#2563eb',
    fontSize: 18,
    fontWeight: '900',
  },
  quickCardTitle: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  quickCardTitleCompact: {
    fontSize: 13,
  },
  quickCardSubtitle: {
    marginTop: 3,
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 15,
  },
  quickCardSubtitleCompact: {
    fontSize: 10,
  },
  recentSection: {
    gap: 2,
  },
  sectionTitle: {
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  recentTitle: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '800',
  },
});
