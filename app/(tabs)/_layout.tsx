import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="history" options={{ title: 'Historial' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
