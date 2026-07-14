import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  INSPECTION_FORMAT_OPTIONS,
  InspectionFormatOption,
  isFormatAlreadyAdded,
} from '../../lib/inspection-formats';

interface Props {
  visible: boolean;
  selectedFormatIds: string[];
  saving: boolean;
  onClose: () => void;
  onAdd: (option: InspectionFormatOption) => void;
}

function visualForType(templateType: InspectionFormatOption['templateType']): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
} {
  switch (templateType) {
    case 'pump': return { icon: 'water', color: '#2563eb' };
    case 'alarm': return { icon: 'notifications', color: '#7c3aed' };
    case 'hydrant': return { icon: 'water', color: '#0891b2' };
    case 'extinguisher': return { icon: 'flame', color: '#d62828' };
    case 'suppression': return { icon: 'shield-checkmark', color: '#ea580c' };
    default: return { icon: 'document-text', color: '#1f3f66' };
  }
}

export default function AddInspectionFormatModal({
  visible,
  selectedFormatIds,
  saving,
  onClose,
  onAdd,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.title}>Agregar formato</Text>
            <Text style={styles.description}>
              Selecciona otro sistema para incluirlo en esta inspección.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar selector de formatos"
          >
            <Ionicons name="close" size={23} color="#334155" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {INSPECTION_FORMAT_OPTIONS.map((option) => {
            const added = isFormatAlreadyAdded(option, selectedFormatIds);
            const visual = visualForType(option.templateType);
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.card, added && styles.cardAdded]}
                activeOpacity={0.76}
                disabled={saving}
                onPress={() => {
                  if (added) {
                    Alert.alert('Formato ya agregado', 'Este formato ya forma parte de la inspección.');
                    return;
                  }
                  onAdd(option);
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: added || saving }}
              >
                <View style={[styles.icon, { backgroundColor: `${visual.color}16` }]}>
                  <Ionicons name={visual.icon} size={23} color={visual.color} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{option.name}</Text>
                  <Text style={styles.cardDescription}>{option.description}</Text>
                </View>
                {added ? (
                  <View style={styles.addedBadge}>
                    <Ionicons name="checkmark" size={14} color="#64748b" />
                    <Text style={styles.addedText}>Ya agregado</Text>
                  </View>
                ) : (
                  <Ionicons name="add-circle-outline" size={23} color="#1f3f66" />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heading: { flex: 1, gap: 5 },
  title: { color: '#1f3f66', fontSize: 24, fontWeight: '800' },
  description: { color: '#64748b', fontSize: 13, lineHeight: 19 },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  card: {
    minHeight: 76,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardAdded: { backgroundColor: '#f1f5f9', opacity: 0.78 },
  icon: { width: 43, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { color: '#1f2937', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  cardDescription: { marginTop: 2, color: '#64748b', fontSize: 12, lineHeight: 17 },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addedText: { color: '#64748b', fontSize: 11, fontWeight: '700' },
});
