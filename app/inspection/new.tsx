import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createInspection } from '../../lib/repositories/inspections.repo';
import { Company, getCompanies } from '../../lib/repositories/companies.repo';
import { loadSettings } from '../../lib/settings-manager';
import { SITE_FORM_TYPE, SITE_FORM_VERSION, SiteFormData } from '../../types/inspection.types';
import { ADDITIONAL_SCHEMAS } from '../../schemas';

// Decision B: pumps and other equipment are inspected on different days.
// - "Nueva inspección" (no ?format) → the 3 pumps together (no selectedFormatIds,
//   the index screen falls back to PUMP_SCHEMAS).
// - ?format=<id> (extintores, hidrantes, ...) → that single non-pump format.
export default function NewInspectionScreen() {
  const router = useRouter();
  const { format } = useLocalSearchParams<{ format?: string; source?: string }>();

  const additionalSchema = ADDITIONAL_SCHEMAS.find((s) => s.id === format);
  const isExtintores = additionalSchema?.id === 'extintores';

  const [clientName, setClientName] = useState('');
  const [area, setArea] = useState('');
  const [atencion, setAtencion] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  useEffect(() => {
    loadSettings()
      .then((s) => setTechnicianName(s.technicianName))
      .catch(console.error);
    getCompanies()
      .then(setCompanies)
      .catch(console.error);
  }, []);

  function applyCompany(company: Company) {
    setSelectedCompanyId(company.id);
    setClientName(company.name);
    setArea(company.area);
    setAtencion(company.attention);
  }

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
      // Pumps stay implicit (the 3 together). A specific format pins selectedFormatIds.
      if (additionalSchema) initialFormData.selectedFormatIds = [additionalSchema.id];

      const inspection = await createInspection({
        form_type: SITE_FORM_TYPE,
        form_version: SITE_FORM_VERSION,
        technician_name: technicianName.trim(),
        client_name: clientName.trim(),
        location: area.trim(),
        status: 'draft',
        pending_comment: null,
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

  const title = additionalSchema ? additionalSchema.name : 'Inspección de bombas';
  const hint = additionalSchema
    ? `Captura los datos del sitio para iniciar ${additionalSchema.name.toLowerCase()}.`
    : 'Captura los datos del sitio. Se abrirán las 3 bombas (jockey, diésel y eléctrica).';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.formType}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>

      {isExtintores && companies.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Empresa</Text>
          <View style={styles.companyList}>
            {companies.map((company) => {
              const selected = selectedCompanyId === company.id;
              return (
                <TouchableOpacity
                  key={company.id}
                  style={[styles.companyCard, selected && styles.companyCardSelected]}
                  onPress={() => applyCompany(company)}
                  activeOpacity={0.76}
                >
                  <View style={styles.companyIcon}>
                    <Ionicons name="business" size={21} color={selected ? '#ffffff' : '#1f3f66'} />
                  </View>
                  <View style={styles.companyTextBlock}>
                    <Text style={[styles.companyName, selected && styles.companyNameSelected]}>
                      {company.name}
                    </Text>
                    <Text style={[styles.companyMeta, selected && styles.companyMetaSelected]}>
                      {company.area}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

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
          {isCreating ? 'Creando...' : additionalSchema ? `Iniciar ${additionalSchema.name}` : 'Iniciar inspección'}
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1e3a5f',
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: -8,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  required: {
    color: '#dc2626',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  companyList: {
    gap: 10,
  },
  companyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  companyCardSelected: {
    backgroundColor: '#1e3a5f',
    borderColor: '#1e3a5f',
  },
  companyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  companyName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  companyNameSelected: {
    color: '#ffffff',
  },
  companyMeta: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  companyMetaSelected: {
    color: '#dbeafe',
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
    fontWeight: '700',
  },
});
