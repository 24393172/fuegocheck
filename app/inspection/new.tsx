import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { createInspection } from '../../lib/repositories/inspections.repo';
import { loadSettings } from '../../lib/settings-manager';
import { pumpFormV2 } from '../../schemas';

export default function NewInspectionScreen() {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadSettings()
      .then((s) => setTechnicianName(s.technicianName))
      .catch(console.error);
  }, []);

  async function handleCreate() {
    if (!clientName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del cliente.');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Campo requerido', 'Ingresa la dirección o ubicación.');
      return;
    }
    if (!technicianName.trim()) {
      Alert.alert(
        'Falta el técnico',
        'Configura tu nombre de técnico en la pestaña Ajustes antes de crear una inspección.'
      );
      return;
    }

    try {
      setIsCreating(true);
      const today = new Date().toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      // Pre-fill the fields that new.tsx already knows at creation time.
      // The rest are filled by the technician in fill.tsx.
      const initialFormData = {
        cliente: clientName.trim(),
        fecha: today,
        tecnico: technicianName.trim(),
      };

      const inspection = await createInspection({
        form_type: pumpFormV2.id,
        form_version: pumpFormV2.version,
        technician_name: technicianName.trim(),
        client_name: clientName.trim(),
        location: location.trim(),
        status: 'draft',
        form_data: JSON.stringify(initialFormData),
      });

      router.replace(`/inspection/${inspection.id}/fill`);
    } catch (error) {
      console.error('[new] Failed to create inspection:', error);
      Alert.alert('Error', 'No se pudo crear la inspección. Intenta de nuevo.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.formType}>Bomba de Combustión Interna Contra Incendios</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Cliente <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={clientName}
          onChangeText={setClientName}
          placeholder="Nombre del cliente o empresa"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Dirección / Ubicación <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Dirección o descripción del lugar"
          placeholderTextColor="#6b7280"
          autoCapitalize="sentences"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, isCreating && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isCreating}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {isCreating ? 'Creando...' : 'Iniciar Inspección'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  formType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e3a5f',
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  required: {
    color: '#dc2626',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  button: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
