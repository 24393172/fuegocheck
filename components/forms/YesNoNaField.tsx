import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type YesNoNaValue = 'si' | 'no' | 'na' | null;

interface Props {
  value: YesNoNaValue;
  onChange: (value: YesNoNaValue) => void;
}

// Icons stay visible on every state so the selection is never communicated by
// color alone (color-blind technicians, direct sunlight in the field).
const OPTIONS: { value: YesNoNaValue; label: string; icon: string; color: string }[] = [
  { value: 'si', label: 'Sí', icon: '✓', color: '#16a34a' },
  { value: 'no', label: 'No', icon: '✗', color: '#dc2626' },
  { value: 'na', label: 'N/A', icon: '', color: '#6b7280' },
];

export default function YesNoNaField({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.button,
              isSelected && { backgroundColor: opt.color, borderColor: opt.color },
            ]}
            onPress={() => onChange(isSelected ? null : opt.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {opt.icon ? `${opt.icon} ${opt.label}` : opt.label}
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
    // Tall tap target (~52px) for comfortable taps with gloves or in a hurry.
    paddingVertical: 15,
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 6,
    // Constant width 2 so selecting doesn't shift the layout by a pixel.
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  labelSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
