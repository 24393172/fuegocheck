import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { createInspection } from '../../lib/repositories/inspections.repo';
import { loadSettings } from '../../lib/settings-manager';
import { SITE_FORM_TYPE, SITE_FORM_VERSION, SiteFormData } from '../../types/inspection.types';

export default function NewInspectionScreen() {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [area, setArea] = useState('');
  const [atencion, setAtencion] = useState('');
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
    if (!area.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el área (ej. Cuarto de Máquinas).');
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

      // Site-level data is shared by every pump in the inspection. Each pump's
      // answers are filled later in fill.tsx and stored under form_data.pumps.
      const initialFormData: SiteFormData = {
        site: {
          cliente: clientName.trim(),
          atencion: atencion.trim(),
          area: area.trim(),
          fecha: today,
          tecnico: technicianName.trim(),
        },
        pumps: {},
      };

      const inspection = await createInspection({
        form_type: SITE_FORM_TYPE,
        form_version: SITE_FORM_VERSION,
        technician_name: technicianName.trim(),
        client_name: clientName.trim(),
        location: area.trim(),
        status: 'draft',
        form_data: JSON.stringify(initialFormData),
      });

      router.replace(`/inspection/${inspection.id}`);
    } catch (error) {
      console.error('[new] Failed to create inspection:', error);
      Alert.alert('Error', 'No se pudo crear la inspección. Intenta de nuevo.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.formType}>Inspección de bombas contra incendio</Text>
      <Text style={styles.hint}>
        Captura los datos del sitio. Después elegirás qué bombas inspeccionar.
      </Text>

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
        <Text style={styles.label}>Área <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={area}
          onChangeText={setArea}
          placeholder="Ej. Cuarto de Máquinas"
          placeholderTextColor="#6b7280"
          autoCapitalize="sentences"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Atención</Text>
        <TextInput
          style={styles.input}
          value={atencion}
          onChangeText={setAtencion}
          placeholder="Ing. responsable (opcional)"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
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
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: -8,
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
