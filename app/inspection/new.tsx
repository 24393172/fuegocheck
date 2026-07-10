import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createInspection } from '../../lib/repositories/inspections.repo';
import { Company, getCompanies } from '../../lib/repositories/companies.repo';
import { loadSettings } from '../../lib/settings-manager';
import { SITE_FORM_TYPE, SITE_FORM_VERSION, SiteFormData } from '../../types/inspection.types';
import { INSPECTION_SCHEMAS } from '../../schemas';

type Step = 'client' | 'format';

export default function NewInspectionScreen() {
  const router = useRouter();
  const { format, source } = useLocalSearchParams<{ format?: string; source?: string }>();
  const extinguisherOnly = format === 'extintores' && source === 'dashboard_extintores';
  const initialFormat = INSPECTION_SCHEMAS.some((schema) => schema.id === format)
    ? format!
    : INSPECTION_SCHEMAS[0]?.id ?? '';

  const [step, setStep] = useState<Step>('client');
  const [selectedFormatId, setSelectedFormatId] = useState(initialFormat);
  const [clientName, setClientName] = useState('');
  const [area, setArea] = useState('');
  const [atencion, setAtencion] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const formats = useMemo(
    () => extinguisherOnly
      ? INSPECTION_SCHEMAS.filter((schema) => schema.id === 'extintores')
      : INSPECTION_SCHEMAS,
    [extinguisherOnly]
  );

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

  function handleNext() {
    if (!clientName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del cliente.');
      return;
    }
    if (!area.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el area (ej. Cuarto de Maquinas).');
      return;
    }
    if (extinguisherOnly) {
      handleCreate('extintores');
      return;
    }
    setStep('format');
  }

  async function handleCreate(formatId = selectedFormatId) {
    if (!clientName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del cliente.');
      return;
    }
    if (!area.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el area (ej. Cuarto de Maquinas).');
      return;
    }
    if (!formatId) {
      Alert.alert('Campo requerido', 'Elige el formato de inspeccion que vas a llenar.');
      return;
    }
    if (!technicianName.trim()) {
      Alert.alert(
        'Falta el tecnico',
        'Configura tu nombre de tecnico en la pestana Ajustes antes de crear una inspeccion.'
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
        selectedFormatIds: [formatId],
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
      Alert.alert('Error', 'No se pudo crear la inspeccion. Intenta de nuevo.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.formType}>
        {extinguisherOnly ? 'Extintores' : 'Nueva inspeccion'}
      </Text>
      <Text style={styles.hint}>
        {step === 'client'
          ? extinguisherOnly
            ? 'Elige una empresa para iniciar el formato de extintores.'
            : 'Primero captura los datos del cliente.'
          : 'Ahora elige el formato que vas a llenar.'}
      </Text>

      {step === 'client' ? (
        <>
          {extinguisherOnly && (
            <View style={styles.field}>
              <Text style={styles.label}>Empresa <Text style={styles.required}>*</Text></Text>
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
            <Text style={styles.label}>Area <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={area}
              onChangeText={setArea}
              placeholder="Ej. Cuarto de Maquinas"
              placeholderTextColor="#6b7280"
              autoCapitalize="sentences"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Atencion</Text>
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
            onPress={handleNext}
            disabled={isCreating}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isCreating ? 'Creando...' : extinguisherOnly ? 'Iniciar extintores' : 'Continuar'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{clientName}</Text>
            <Text style={styles.summaryText}>{area}</Text>
            {atencion.trim() ? <Text style={styles.summaryText}>{atencion}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Formato <Text style={styles.required}>*</Text></Text>
            <View style={styles.formatGrid}>
              {formats.map((item) => {
                const selected = selectedFormatId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.formatCard, selected && styles.formatCardSelected]}
                    onPress={() => setSelectedFormatId(item.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.formatName, selected && styles.formatNameSelected]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, isCreating && styles.buttonDisabled]}
              onPress={() => setStep('client')}
              disabled={isCreating}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Regresar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonFlex, isCreating && styles.buttonDisabled]}
              onPress={() => handleCreate()}
              disabled={isCreating}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>{isCreating ? 'Creando...' : 'Iniciar inspeccion'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 3,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  summaryText: {
    color: '#6b7280',
    fontSize: 13,
  },
  formatGrid: {
    gap: 10,
  },
  formatCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  formatCardSelected: {
    backgroundColor: '#1e3a5f',
    borderColor: '#1e3a5f',
  },
  formatName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  formatNameSelected: {
    color: '#ffffff',
  },
  button: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonFlex: {
    flex: 1,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
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
