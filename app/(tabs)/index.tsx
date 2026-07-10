import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { InspectionListItem } from '../../types/inspection.types';
import {
  getInspectionsForList,
  getInspectionCounts,
} from '../../lib/repositories/inspections.repo';
import { loadSettings } from '../../lib/settings-manager';
import InspectionCard from '../../components/ui/InspectionCard';

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
  const [recent, setRecent] = useState<InspectionListItem[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0 });
  const [technicianName, setTechnicianName] = useState('');

  useFocusEffect(
    useCallback(() => {
      Promise.all([getInspectionsForList(5), getInspectionCounts(), loadSettings()])
        .then(([latest, counts, settings]) => {
          setRecent(latest);
          setStats({ pending: counts.draft + counts.completed });
          setTechnicianName(settings.technicianName);
        })
        .catch(console.error);
    }, [])
  );

  function handleCardPress(inspection: InspectionListItem) {
    router.push(`/inspection/${inspection.id}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
          onPress={() => router.push('/inspection/new')}
          activeOpacity={0.82}
        >
          <Ionicons name="add-circle" size={22} color="#ffffff" />
          <Text style={styles.primaryActionText}>Nueva inspeccion</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() => router.push('/inspection/new?format=extintores&source=dashboard_extintores')}
          activeOpacity={0.78}
        >
          <Ionicons name="flame" size={28} color="#d62828" />
          <Text style={styles.actionText}>Extintores</Text>
        </TouchableOpacity>
      </View>

      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.sectionTitle}>
            <Text style={styles.recentTitle}>Inspecciones recientes</Text>
          </View>
          {recent.map((insp) => (
            <InspectionCard
              key={insp.id}
              inspection={insp}
              onPress={() => handleCardPress(insp)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  actionText: {
    marginTop: 8,
    color: '#1f2937',
    fontSize: 15,
    fontWeight: '800',
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
