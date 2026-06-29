import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { InspectionListItem } from '../../types/inspection.types';
import StatusBadge from './StatusBadge';

// InspectionListItem covers everything the card shows; a full Inspection is
// also accepted since it has the same fields plus more.
interface Props {
  inspection: InspectionListItem;
  onPress: () => void;
}

function formatDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default memo(function InspectionCard({ inspection, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.top}>
        <Text style={styles.clientName} numberOfLines={1}>
          {inspection.client_name || 'Sin nombre'}
        </Text>
        <StatusBadge status={inspection.status} />
      </View>
      <Text style={styles.location} numberOfLines={1}>
        {inspection.location || 'Sin ubicación'}
      </Text>
      <View style={styles.bottom}>
        <Text style={styles.date}>{formatDate(inspection.created_at)}</Text>
        {inspection.technician_name ? (
          <Text style={styles.technician} numberOfLines={1}>
            {inspection.technician_name}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  clientName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  location: {
    fontSize: 13,
    color: '#6b7280',
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  date: {
    fontSize: 12,
    color: '#6b7280',
  },
  technician: {
    fontSize: 12,
    color: '#6b7280',
    maxWidth: 160,
  },
});
