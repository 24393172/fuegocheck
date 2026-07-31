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
import { APP_VERSION } from '../../constants/config';
import { getCatalogStatus, syncCatalog } from '../../services/catalog-sync';
import { CatalogStatus } from '../../types/catalog.types';
import {
  LocalServerDiagnostics,
  runLocalServerDiagnostics,
} from '../../services/local-server-api';

// Simple format check — good enough to catch typos before the composer opens.
function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

export default function SettingsScreen() {
  const [technicianName, setTechnicianName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<LocalServerDiagnostics | null>(null);

  useEffect(() => {
    loadSettings()
      .then((s) => {
        setTechnicianName(s.technicianName);
        setRecipientEmail(s.recipientEmail);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
    getCatalogStatus().then(setCatalogStatus).catch(console.error);
  }, []);

  async function handleCatalogSync() {
    if (isSyncingCatalog) return;
    try {
      setIsSyncingCatalog(true);
      const status = await syncCatalog();
      setCatalogStatus(status);
      Alert.alert(
        'Catálogo actualizado',
        'Catálogo actualizado correctamente.\nLas empresas y ubicaciones ya están disponibles sin conexión.'
      );
    } catch (error) {
      console.error('[settings] Catalog sync failed:', error);
      setCatalogStatus(await getCatalogStatus().catch(() => catalogStatus));
      Alert.alert(
        'Servidor no disponible',
        'No se encontró el servidor local.\nPuedes continuar usando el último catálogo guardado en el dispositivo.'
      );
    } finally {
      setIsSyncingCatalog(false);
    }
  }

  async function handleRunDiagnostics() {
    if (isRunningDiagnostics) return;
    setIsRunningDiagnostics(true);
    try {
      setDiagnostics(await runLocalServerDiagnostics());
    } finally {
      setIsRunningDiagnostics(false);
    }
  }

  async function handleSave() {
    if (!technicianName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del técnico.');
      return;
    }
    if (!isValidEmail(recipientEmail.trim())) {
      Alert.alert('Correo inválido', 'Revisa el correo del destinatario (ej. nombre@empresa.com).');
      return;
    }
    try {
      setIsSaving(true);
      await saveSettings({
        technicianName: technicianName.trim(),
        recipientEmail: recipientEmail.trim(),
      });
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
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
        />
        <Text style={styles.hint}>
          Se usará automáticamente al crear nuevas inspecciones.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Correo electrónico</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Destinatario de los reportes</Text>
        <TextInput
          style={styles.input}
          value={recipientEmail}
          onChangeText={setRecipientEmail}
          placeholder="nombre@empresa.com"
          placeholderTextColor="#6b7280"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Al compartir una inspección, el correo se abre con el Excel y las fotos
          adjuntos, dirigido a esta dirección. Solo hay que tocar Enviar.
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

      <Text style={styles.sectionTitle}>Catálogo local</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Empresas y ubicaciones para uso sin conexión</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Última actualización</Text>
          <Text style={styles.infoValue}>
            {catalogStatus?.lastSync
              ? new Date(catalogStatus.lastSync).toLocaleString('es-MX', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })
              : 'Nunca'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Empresas</Text>
          <Text style={styles.infoValue}>{catalogStatus?.companies ?? 0}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Extintores</Text>
          <Text style={styles.infoValue}>{catalogStatus?.extinguisherLocations ?? 0} ubicaciones</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Hidrantes</Text>
          <Text style={styles.infoValue}>{catalogStatus?.hydrantLocations ?? 0} ubicaciones</Text>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.infoLabel}>Servidor local</Text>
          <Text style={[styles.infoValue, styles.serverValue]} numberOfLines={2}>
            {catalogStatus?.serverUrl ?? 'No configurado'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveButton, isSyncingCatalog && styles.buttonDisabled]}
          onPress={handleCatalogSync}
          disabled={isSyncingCatalog}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>
            {isSyncingCatalog ? 'Actualizando catálogo...' : 'Actualizar empresas y ubicaciones'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Conexión local</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Diagnóstico del servidor</Text>
        <Text style={styles.hint}>
          Comprueba la conexión sin guardar el catálogo ni mostrar la clave API.
        </Text>
        <View style={styles.diagnosticRow}>
          <Text style={styles.infoLabel}>URL del servidor</Text>
          <Text style={[styles.infoValue, styles.serverValue]} numberOfLines={2}>
            {diagnostics?.serverUrl ?? catalogStatus?.serverUrl ?? 'Ejecuta el diagnóstico'}
          </Text>
        </View>
        <View style={styles.diagnosticRow}>
          <Text style={styles.infoLabel}>Clave API configurada</Text>
          <Text style={styles.infoValue}>
            {diagnostics ? (diagnostics.apiKeyConfigured ? 'Sí' : 'No') : 'Sin comprobar'}
          </Text>
        </View>
        <View style={styles.diagnosticResult}>
          <Text style={styles.diagnosticLabel}>/api/health</Text>
          <Text
            style={[
              styles.diagnosticDetail,
              diagnostics && (diagnostics.health.ok ? styles.resultOk : styles.resultError),
            ]}
          >
            {diagnostics?.health.detail ?? 'Sin comprobar'}
          </Text>
        </View>
        <View style={styles.diagnosticResult}>
          <Text style={styles.diagnosticLabel}>Catálogo autenticado</Text>
          <Text
            style={[
              styles.diagnosticDetail,
              diagnostics && (diagnostics.catalog.ok ? styles.resultOk : styles.resultError),
            ]}
          >
            {diagnostics?.catalog.detail ?? 'Sin comprobar'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveButton, isRunningDiagnostics && styles.buttonDisabled]}
          onPress={handleRunDiagnostics}
          disabled={isRunningDiagnostics}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Probar conexión con el servidor local"
        >
          <Text style={styles.saveButtonText}>
            {isRunningDiagnostics ? 'Comprobando...' : 'Probar conexión'}
          </Text>
        </TouchableOpacity>
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
    color: '#6b7280',
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
  serverValue: { flex: 1, marginLeft: 12, textAlign: 'right' },
  diagnosticRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  diagnosticResult: {
    paddingVertical: 6,
    gap: 2,
  },
  diagnosticLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  diagnosticDetail: {
    fontSize: 13,
    color: '#6b7280',
  },
  resultOk: {
    color: '#047857',
  },
  resultError: {
    color: '#b91c1c',
  },
});
