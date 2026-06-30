import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { InspectionListItem } from '../../types/inspection.types';
import {
  getInspectionsForList,
  getInspectionCounts,
} from '../../lib/repositories/inspections.repo';
import InspectionCard from '../../components/ui/InspectionCard';

interface Stats {
  total: number;
  pending: number;
  sent: number;
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [recent, setRecent] = useState<InspectionListItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, sent: 0 });

  useFocusEffect(
    useCallback(() => {
      Promise.all([getInspectionsForList(5), getInspectionCounts()])
        .then(([latest, counts]) => {
          setRecent(latest);
          setStats({
            total: counts.draft + counts.completed + counts.sent,
            pending: counts.draft + counts.completed,
            sent: counts.sent,
          });
        })
        .catch(console.error);
    }, [])
  );

  function handleCardPress(inspection: InspectionListItem) {
    // All inspections open their index screen (the list of pumps + share).
    router.push(`/inspection/${inspection.id}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Fuego & Seguridad</Text>
        <Text style={styles.subtitle}>Inspecciones contra incendio</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={stats.total} label="Total" color="#1e3a5f" />
        <StatCard value={stats.pending} label="Por enviar" color="#b45309" />
        <StatCard value={stats.sent} label="Enviadas" color="#15803d" />
      </View>

      <TouchableOpacity
        style={styles.newButton}
        onPress={() => router.push('/inspection/new')}
        activeOpacity={0.8}
      >
        <Text style={styles.newButtonText}>+ Nueva Inspección</Text>
      </TouchableOpacity>

      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recientes</Text>
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
    backgroundColor: '#f9fafb',
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e3a5f',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  newButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
  },
  newButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  recentSection: {
    gap: 2,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
});
