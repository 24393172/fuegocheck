import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createInspection } from '../../lib/repositories/inspections.repo';
import { getBranchesByCompany, getCompanies, syncCatalog } from '../../services/catalog-sync';
import { CatalogBranch, CatalogCompany } from '../../types/catalog.types';
import { loadSettings } from '../../lib/settings-manager';
import { INSPECTION_FORMAT_OPTIONS, PUMPS_FORMAT_ID } from '../../lib/inspection-formats';
import { SITE_FORM_TYPE, SITE_FORM_VERSION, SiteFormData } from '../../types/inspection.types';
import { normalizeFirePumpsData } from '../../lib/fire-pumps';
import { ALARM_FORMAT_ID, normalizeAlarmsData } from '../../lib/alarms';
import { ANSUL_FORMAT_ID, normalizeAnsulData } from '../../lib/ansul';
import { ansulR102Form, tableroAdForm } from '../../schemas';

type Step = 'template' | 'client';

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

function getTemplateIcon(templateType?: string): keyof typeof Ionicons.glyphMap {
  switch (templateType) {
    case 'pump':
      return 'water';
    case 'alarm':
      return 'notifications';
    case 'hydrant':
      return 'water';
    case 'extinguisher':
      return 'flame';
    case 'suppression':
      return 'shield-checkmark';
    default:
      return 'document-text';
  }
}

function getTemplateColor(templateType?: string): string {
  switch (templateType) {
    case 'pump':
      return '#2563eb';
    case 'alarm':
      return '#7c3aed';
    case 'hydrant':
      return '#0891b2';
    case 'extinguisher':
      return '#d62828';
    case 'suppression':
      return '#ea580c';
    default:
      return '#1f3f66';
  }
}

export default function NewInspectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { format, category } = useLocalSearchParams<{
    format?: string;
    category?: string;
    source?: string;
  }>();

  const availableTemplates = useMemo<TemplateOption[]>(() => {
    return INSPECTION_FORMAT_OPTIONS
      .filter((option) => category !== 'bombas' || option.id === PUMPS_FORMAT_ID)
      .filter((option) => category !== 'alarmas' || option.templateType === 'alarm')
      .map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description,
        icon: getTemplateIcon(option.templateType),
        color: getTemplateColor(option.templateType),
      }));
  }, [category]);

  const requestedTemplate = category === 'bombas'
    ? PUMPS_FORMAT_ID
    : format === PUMPS_FORMAT_ID || availableTemplates.some((template) => template.id === format)
      ? format
      : '';
  const opensDirectlyInCompanyStep = Boolean(format && requestedTemplate);

  const [step, setStep] = useState<Step>(
    opensDirectlyInCompanyStep ? 'client' : 'template'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(requestedTemplate);
  const [clientName, setClientName] = useState('');
  const [area, setArea] = useState('');
  const [atencion, setAtencion] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [companies, setCompanies] = useState<CatalogCompany[]>([]);
  const [branches, setBranches] = useState<CatalogBranch[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);

  const selectedTemplate = availableTemplates.find(
    (template) => template.id === selectedTemplateId
  );
  const filteredCompanies = useMemo(() => {
    const query = companySearch.trim().toLocaleLowerCase('es-MX');
    if (!query) return companies;
    return companies.filter((company) =>
      company.name.toLocaleLowerCase('es-MX').includes(query)
    );
  }, [companies, companySearch]);

  useEffect(() => {
    setStep(opensDirectlyInCompanyStep ? 'client' : 'template');
    setSelectedTemplateId(requestedTemplate);
  }, [opensDirectlyInCompanyStep, requestedTemplate]);

  useEffect(() => {
    loadSettings()
      .then((settings) => setTechnicianName(settings.technicianName))
      .catch(console.error);
    getCompanies()
      .then(setCompanies)
      .catch(console.error);
  }, []);

  async function toggleCompany(company: CatalogCompany) {
    if (selectedCompanyId === company.id) {
      setSelectedCompanyId('');
      setSelectedBranchId('');
      setBranches([]);
      setClientName('');
      setArea('');
      setAtencion('');
      return;
    }

    setSelectedCompanyId(company.id);
    setSelectedBranchId('');
    setClientName(company.name);
    setArea('');
    setAtencion('');
    try {
      setBranches(await getBranchesByCompany(company.id));
    } catch (error) {
      console.error('[new] Failed to load branches:', error);
      setBranches([]);
    }
  }

  function selectBranch(branch: CatalogBranch | null) {
    setSelectedBranchId(branch?.id ?? '');
    setArea(branch?.name ?? '');
  }

  async function handleCatalogSync() {
    if (isSyncingCatalog) return;
    try {
      setIsSyncingCatalog(true);
      await syncCatalog();
      setCompanies(await getCompanies());
      Alert.alert(
        'Catálogo actualizado',
        'Catálogo actualizado correctamente.\nLas empresas y ubicaciones ya están disponibles sin conexión.'
      );
    } catch (error) {
      console.error('[new] Catalog sync failed:', error);
      Alert.alert(
        'Servidor no disponible',
        'No se encontró el servidor local.\nPuedes continuar usando el último catálogo guardado en el dispositivo.'
      );
    } finally {
      setIsSyncingCatalog(false);
    }
  }

  function handleContinue() {
    if (!selectedTemplate) {
      Alert.alert('Selecciona una plantilla', 'Elige el tipo de inspección que deseas realizar.');
      return;
    }
    setStep('client');
  }

  async function handleCreate() {
    if (!selectedCompanyId) {
      Alert.alert('Selecciona una empresa', 'Elige una empresa antes de iniciar la inspección.');
      return;
    }
    if (!clientName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del cliente.');
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
          companyId: selectedCompanyId,
          companyNameSnapshot: clientName.trim(),
          branchId: selectedBranchId || null,
          branchNameSnapshot: branches.find((branch) => branch.id === selectedBranchId)?.name ?? '',
          atencion: atencion.trim(),
          area: area.trim(),
          fecha: today,
          tecnico: technicianName.trim(),
        },
        pumps: {},
      };

      // El grupo bombas conserva la lógica existente de abrir sus tres formularios.
      const selectedFormat = INSPECTION_FORMAT_OPTIONS.find(
        (option) => option.id === selectedTemplateId
      );
      initialFormData.selectedFormatIds = selectedFormat
        ? [...selectedFormat.schemaIds]
        : [];
      if (selectedFormat?.id === PUMPS_FORMAT_ID) {
        initialFormData.firePumps = normalizeFirePumpsData(undefined).data;
      }
      if (selectedFormat?.id === ALARM_FORMAT_ID) {
        initialFormData.alarms = normalizeAlarmsData(initialFormData, tableroAdForm).data;
      }
      if (selectedFormat?.id === ANSUL_FORMAT_ID) {
        initialFormData.ansul = normalizeAnsulData(initialFormData, ansulR102Form).data;
      }

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

  if (step === 'template') {
    return (
      <View style={styles.selectorScreen}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.headingBlock}>
            <Text style={styles.screenTitle}>Elige una plantilla</Text>
            <Text style={styles.hint}>
              {category === 'alarmas'
                ? 'Selecciona el sistema de alarma que deseas inspeccionar.'
                : 'Selecciona el tipo de inspección para continuar.'}
            </Text>
          </View>

          <View style={styles.templateList}>
            {availableTemplates.map((template) => {
              const selected = template.id === selectedTemplateId;
              return (
                <TouchableOpacity
                  key={template.id}
                  style={[styles.templateCard, selected && styles.templateCardSelected]}
                  onPress={() => setSelectedTemplateId(selected ? '' : template.id)}
                  activeOpacity={0.78}
                >
                  <View style={[styles.templateIcon, { backgroundColor: `${template.color}16` }]}>
                    <Ionicons name={template.icon} size={24} color={template.color} />
                  </View>
                  <View style={styles.templateTextBlock}>
                    <Text style={styles.templateName}>{template.name}</Text>
                    <Text style={styles.templateDescription}>{template.description}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={selected ? '#1f3f66' : '#cbd5e1'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {selectedTemplate && (
          <View
            style={[
              styles.stickyAction,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <TouchableOpacity
              style={[styles.button, styles.stickyButton]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.selectorScreen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
      {!format && (
        <TouchableOpacity
          style={styles.changeTemplateButton}
          onPress={() => setStep('template')}
          activeOpacity={0.72}
        >
          <Ionicons name="chevron-back" size={18} color="#1f3f66" />
          <Text style={styles.changeTemplateText}>Cambiar plantilla</Text>
        </TouchableOpacity>
      )}

      <View style={styles.headingBlock}>
        <Text style={styles.formType}>{selectedTemplate?.name}</Text>
        <Text style={styles.hint}>
          Captura los datos del sitio para iniciar la inspección.
        </Text>
      </View>

      {companies.length > 0 ? (
        <View style={styles.field}>
          <Text style={styles.label}>Selecciona una empresa</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={19} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              value={companySearch}
              onChangeText={setCompanySearch}
              placeholder="Buscar empresa por nombre"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {companySearch.length > 0 && (
              <TouchableOpacity
                onPress={() => setCompanySearch('')}
                accessibilityRole="button"
                accessibilityLabel="Limpiar búsqueda"
                hitSlop={10}
              >
                <Ionicons name="close-circle" size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.companyList}>
            {filteredCompanies.map((company) => {
              const selected = selectedCompanyId === company.id;
              return (
                <TouchableOpacity
                  key={company.id}
                  style={[styles.companyCard, selected && styles.companyCardSelected]}
                  onPress={() => void toggleCompany(company)}
                  disabled={isCreating}
                  activeOpacity={0.76}
                >
                  <View style={styles.companyIcon}>
                    <Ionicons name="business" size={21} color={selected ? '#ffffff' : '#1f3f66'} />
                  </View>
                  <View style={styles.companyTextBlock}>
                    <Text style={[styles.companyName, selected && styles.companyNameSelected]}>
                      {company.name}
                    </Text>
                    {!!company.businessName && (
                      <Text style={[styles.companyMeta, selected && styles.companyMetaSelected]}>
                        {company.businessName}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            {filteredCompanies.length === 0 && (
              <View style={styles.emptyCompanies}>
                <Ionicons name="business-outline" size={24} color="#94a3b8" />
                <Text style={styles.emptyCompaniesText}>
                  No encontramos empresas con ese nombre.
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.noCatalogCard}>
          <Ionicons name="cloud-offline-outline" size={30} color="#64748b" />
          <Text style={styles.noCatalogTitle}>No hay empresas disponibles en este dispositivo.</Text>
          <Text style={styles.noCatalogText}>
            Conéctate a la misma red que el servidor y actualiza el catálogo.
          </Text>
          <TouchableOpacity
            style={[styles.catalogButton, isSyncingCatalog && styles.buttonDisabled]}
            onPress={handleCatalogSync}
            disabled={isSyncingCatalog}
          >
            <Text style={styles.catalogButtonText}>
              {isSyncingCatalog ? 'Actualizando...' : 'Actualizar catálogo'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedCompanyId && branches.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Sucursal (opcional)</Text>
          <View style={styles.branchList}>
            <TouchableOpacity
              style={[styles.branchCard, !selectedBranchId && styles.branchCardSelected]}
              onPress={() => selectBranch(null)}
            >
              <Text style={[styles.branchName, !selectedBranchId && styles.branchNameSelected]}>
                Sin sucursal
              </Text>
            </TouchableOpacity>
            {branches.map((branch) => {
              const selected = branch.id === selectedBranchId;
              return (
                <TouchableOpacity
                  key={branch.id}
                  style={[styles.branchCard, selected && styles.branchCardSelected]}
                  onPress={() => selectBranch(branch)}
                >
                  <Text style={[styles.branchName, selected && styles.branchNameSelected]}>
                    {branch.name}
                  </Text>
                  {!!branch.address && (
                    <Text style={[styles.branchAddress, selected && styles.companyMetaSelected]}>
                      {branch.address}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>
          Cliente <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={clientName}
          onChangeText={setClientName}
          placeholder="Nombre del cliente o empresa"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
          editable={false}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          Área / sucursal
        </Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={area}
          onChangeText={setArea}
          placeholder="Ej. Cuarto de Máquinas"
          placeholderTextColor="#6b7280"
          autoCapitalize="sentences"
          editable={false}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Atención</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={atencion}
          onChangeText={setAtencion}
          placeholder="Ing. responsable (opcional)"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
          editable={false}
        />
      </View>

      </ScrollView>

      {selectedCompanyId && (
        <View
          style={[
            styles.stickyAction,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <TouchableOpacity
            style={[styles.button, styles.stickyButton, isCreating && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={isCreating}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isCreating ? 'Creando...' : `Iniciar ${selectedTemplate?.name ?? 'inspección'}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selectorScreen: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  headingBlock: {
    gap: 6,
  },
  screenTitle: {
    color: '#1f3f66',
    fontSize: 25,
    fontWeight: '800',
  },
  formType: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e3a5f',
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6b7280',
  },
  templateList: {
    gap: 10,
  },
  templateCard: {
    minHeight: 78,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateCardSelected: {
    borderColor: '#1f3f66',
    borderWidth: 2,
    padding: 13,
    backgroundColor: '#f8fafc',
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  templateName: {
    color: '#1f2937',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  templateDescription: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  changeTemplateButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  changeTemplateText: {
    color: '#1f3f66',
    fontSize: 13,
    fontWeight: '700',
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
  inputDisabled: {
    color: '#475569',
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  companyList: {
    gap: 10,
  },
  searchBox: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    color: '#111827',
    fontSize: 15,
  },
  emptyCompanies: {
    minHeight: 88,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  emptyCompaniesText: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 13,
  },
  noCatalogCard: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    gap: 8,
  },
  noCatalogTitle: { color: '#334155', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  noCatalogText: { color: '#64748b', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  catalogButton: {
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  branchList: { gap: 8 },
  branchCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  branchCardSelected: { borderColor: '#1e3a5f', backgroundColor: '#1e3a5f' },
  branchName: { color: '#334155', fontSize: 14, fontWeight: '700' },
  branchNameSelected: { color: '#ffffff' },
  branchAddress: { color: '#64748b', fontSize: 12, marginTop: 3 },
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
    minHeight: 52,
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  stickyAction: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    boxShadow: '0 -4px 14px rgba(15, 23, 42, 0.08)',
  },
  stickyButton: {
    marginTop: 0,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
});
