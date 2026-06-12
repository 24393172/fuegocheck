import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
}

export default function SectionHeader({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
