import { View, Text, StyleSheet } from 'react-native';
import { InspectionStatus } from '../../types/inspection.types';

interface Props {
  status: InspectionStatus;
}

const STATUS_CONFIG: Record<InspectionStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Borrador', bg: '#f3f4f6', text: '#374151' },
  completed: { label: 'Por enviar', bg: '#fef3c7', text: '#b45309' },
  sent: { label: 'Enviada', bg: '#dcfce7', text: '#15803d' },
};

export default function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
