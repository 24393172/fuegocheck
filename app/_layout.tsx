import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PaperProvider } from 'react-native-paper';
import { initializeDatabase } from '../lib/db';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase()
      .then(() => SplashScreen.hideAsync())
      .catch((error) => {
        console.error('[layout] DB init error:', error);
        SplashScreen.hideAsync().catch(() => {});
      });
  }, []);

  return (
    <PaperProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="inspection/new" options={{ title: 'Nueva Inspección' }} />
        <Stack.Screen name="inspection/[id]/fill" options={{ title: 'Inspección' }} />
        <Stack.Screen name="inspection/[id]/pdf-preview" options={{ title: 'Inspección' }} />
      </Stack>
    </PaperProvider>
  );
}
