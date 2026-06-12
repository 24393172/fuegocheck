import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { loadSettings, saveSettings } from '../../lib/settings-manager';
import { generateMasterExcel } from '../../lib/excel-generator';
import { EMAIL_CONFIG, APP_VERSION } from '../../constants/config';

export default function SettingsScreen() {
  const [technicianName, setTechnicianName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadSettings()
      .then((s) => setTechnicianName(s.technicianName))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave() {
    if (!technicianName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del técnico.');
      return;
    }
    try {
      setIsSaving(true);
      await saveSettings({ technicianName: technicianName.trim() });
      Alert.alert('Guardado', 'Configuración guardada correctamente.');
    } catch (error) {
      console.error('[settings] Save failed:', error);
      Alert.alert('Error', 'No se pudo guardar la configuración. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExportAll() {
    try {
      setIsExporting(true);
      const { filePath, count } = await generateMasterExcel();

      if (count === 0) {
        Alert.alert('Sin inspecciones', 'Aún no hay inspecciones para exportar.');
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'Compartir archivos no está disponible en este dispositivo.');
        return;
      }

      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Exportar inspecciones',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (error) {
      console.error('[settings] Export failed:', error);
      Alert.alert('Error', 'No se pudo exportar. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Técnico</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Nombre del técnico responsable</Text>
        <TextInput
          style={styles.input}
          value={technicianName}
          onChangeText={setTechnicianName}
          placeholder="Nombre completo"
          placeholderTextColor="#9ca3af"
          autoCapitalize="words"
        />
        <Text style={styles.hint}>
          Se usará automáticamente al crear nuevas inspecciones.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <Text style={styles.saveButtonText}>
          {isSaving ? 'Guardando...' : 'Guardar'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Correo electrónico</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Destinatario</Text>
          <Text style={styles.infoValue}>{EMAIL_CONFIG.recipientEmail}</Text>
        </View>
        <Text style={styles.hint}>
          Al completar una inspección, el correo se abre automáticamente con el
          Excel y las fotos ya adjuntos. Solo hay que tocar Enviar.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Exportar datos</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Exportar todas las inspecciones</Text>
        <Text style={styles.hint}>
          Genera un solo archivo Excel con una fila por inspección, listo para
          consolidar o respaldar. Incluye todas las inspecciones guardadas.
        </Text>
        <TouchableOpacity
          style={[styles.saveButton, isExporting && styles.buttonDisabled]}
          onPress={handleExportAll}
          disabled={isExporting}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>
            {isExporting ? 'Exportando...' : 'Exportar todo a Excel'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Aplicación</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Versión</Text>
          <Text style={styles.infoValue}>{APP_VERSION}</Text>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.infoLabel}>Plataforma</Text>
          <Text style={styles.infoValue}>Android</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 16,
  },
  saveButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 13,
    color: '#374151',
  },
  infoValue: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
});
