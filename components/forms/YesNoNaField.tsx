import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type YesNoNaValue = 'si' | 'no' | 'na' | null;

interface Props {
  value: YesNoNaValue;
  onChange: (value: YesNoNaValue) => void;
}

const OPTIONS: { value: YesNoNaValue; label: string; color: string; activeText: string }[] = [
  { value: 'si', label: 'Sí', color: '#16a34a', activeText: '#ffffff' },
  { value: 'no', label: 'No', color: '#dc2626', activeText: '#ffffff' },
  { value: 'na', label: 'N/A', color: '#6b7280', activeText: '#ffffff' },
];

export default function YesNoNaField({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.button, isSelected && { backgroundColor: opt.color }]}
            onPress={() => onChange(isSelected ? null : opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, isSelected && { color: opt.activeText }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
});
