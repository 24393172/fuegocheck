import '../global.css';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PaperProvider } from 'react-native-paper';
import { initializeDatabase } from '../lib/db';
import { loadSettings, saveSettings } from '../lib/settings-manager';
import { cleanupOldAttachmentFiles } from '../lib/attachment-files';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [dbError, setDbError] = useState(false);
  // First launch: the technician must enter their full name before using the app.
  const [needsName, setNeedsName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await initializeDatabase();
        const settings = await loadSettings();
        setNeedsName(!settings.technicianName.trim());
        // Fire-and-forget: prune old shared email files (Excel/signatures).
        cleanupOldAttachmentFiles();
      } catch (error) {
        console.error('[layout] Startup error:', error);
        setDbError(true);
      } finally {
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }
    prepare();
  }, []);

  async function handleSaveName() {
    const name = nameInput.trim();
    // Full name = at least two words; the secretary identifies reports by it.
    if (name.length < 5 || !name.includes(' ')) {
      Alert.alert('Nombre incompleto', 'Ingresa tu nombre completo (nombre y apellido).');
      return;
    }
    try {
      setIsSavingName(true);
      const current = await loadSettings();
      await saveSettings({ ...current, technicianName: name });
      setNeedsName(false);
    } catch (error) {
      console.error('[layout] Could not save technician name:', error);
      Alert.alert('Error', 'No se pudo guardar tu nombre. Intenta de nuevo.');
    } finally {
      setIsSavingName(false);
    }
  }

  if (!isReady) return null; // splash screen is still visible

  // Without the database every screen would crash — stop here with a clear message.
  if (dbError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>No se pudo iniciar la app</Text>
        <Text style={styles.errorMessage}>
          Falló el acceso al almacenamiento del dispositivo. Verifica que haya
          espacio disponible y vuelve a abrir la app. Si el problema continúa,
          contacta a soporte.
        </Text>
      </View>
    );
  }

  if (needsName) {
    return (
      <KeyboardAvoidingView style={styles.welcomeContainer} behavior="padding">
        <Text style={styles.welcomeBrand}>Fuego & Seguridad</Text>
        <Text style={styles.welcomeTitle}>¡Bienvenido!</Text>
        <Text style={styles.welcomeSubtitle}>
          Escribe tu nombre completo. Aparecerá como técnico responsable en
          todos tus reportes de inspección.
        </Text>
        <TextInput
          style={styles.welcomeInput}
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Nombre y apellido"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
        />
        <TouchableOpacity
          style={[styles.welcomeButton, isSavingName && styles.welcomeButtonDisabled]}
          onPress={handleSaveName}
          disabled={isSavingName}
          activeOpacity={0.8}
        >
          <Text style={styles.welcomeButtonText}>
            {isSavingName ? 'Guardando...' : 'Comenzar'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.welcomeHint}>Podrás cambiarlo después en Ajustes.</Text>
      </KeyboardAvoidingView>
    );
  }

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

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f9fafb',
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#dc2626',
  },
  errorMessage: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#f9fafb',
    gap: 10,
  },
  welcomeBrand: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a5f',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#4b5563',
    lineHeight: 22,
    marginBottom: 8,
  },
  welcomeInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  welcomeButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  welcomeButtonDisabled: {
    opacity: 0.6,
  },
  welcomeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  welcomeHint: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
  },
});
