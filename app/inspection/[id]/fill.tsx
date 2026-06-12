import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm, FieldValues, useWatch } from 'react-hook-form';
import { Inspection, Photo, Signature } from '../../../types/inspection.types';
import { FormSchema, FormField as FormFieldType } from '../../../types/form.types';
import {
  getInspection,
  updateInspection,
  updateStatus,
} from '../../../lib/repositories/inspections.repo';
import { getPhotosByInspection } from '../../../lib/repositories/photos.repo';
import { getSignaturesByInspection } from '../../../lib/repositories/signatures.repo';
import { getSchema } from '../../../schemas';
import { useInspectionStore } from '../../../store/inspection.store';
import FormField from '../../../components/forms/FormField';
import PhotoField from '../../../components/forms/PhotoField';
import SignatureField from '../../../components/forms/SignatureField';
import SectionHeader from '../../../components/ui/SectionHeader';

// The pump form only has one signature: the technician. This map keeps the
// renderer generic in case a client signature is ever added back.
const SIGNER_TYPE_MAP: Record<string, 'technician' | 'client'> = {
  firma_tecnico: 'technician',
  firma_cliente: 'client',
};

function signerTypeForField(key: string): 'technician' | 'client' {
  return SIGNER_TYPE_MAP[key] ?? (key.replace('signature_', '') as 'technician' | 'client');
}

function computeProgress(
  schema: FormSchema,
  values: FieldValues,
  photos: Record<string, Photo>,
  signatures: Record<string, Signature>
): { filled: number; total: number } {
  let total = 0;
  let filled = 0;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      total++;
      if (field.type === 'photo') {
        if (photos[field.key]) filled++;
      } else if (field.type === 'signature') {
        if (signatures[signerTypeForField(field.key)]) filled++;
      } else {
        const v = values[field.key];
        if (v !== undefined && v !== null && v !== '') filled++;
      }
    }
  }
  return { filled, total };
}

export default function FillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSaving, setIsSaving, setSaveError } = useInspectionStore();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [photosByKey, setPhotosByKey] = useState<Record<string, Photo>>({});
  const [signaturesByType, setSignaturesByType] = useState<Record<string, Signature>>({});

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { control, watch, reset } = useForm<FieldValues>({ defaultValues: {} });
  const watchedValues = useWatch({ control });

  useEffect(() => {
    async function load() {
      try {
        const insp = await getInspection(id);
        if (!insp) {
          Alert.alert('Error', 'No se encontró la inspección.');
          router.back();
          return;
        }
        const s = getSchema(insp.form_type, insp.form_version);
        if (!s) {
          Alert.alert('Error', 'Tipo de formulario no reconocido.');
          router.back();
          return;
        }

        const [photos, signatures] = await Promise.all([
          getPhotosByInspection(id),
          getSignaturesByInspection(id),
        ]);

        setInspection(insp);
        setSchema(s);
        setPhotosByKey(Object.fromEntries(photos.map((p) => [p.field_key, p])));
        setSignaturesByType(Object.fromEntries(signatures.map((sig) => [sig.signer_type, sig])));
        reset(JSON.parse(insp.form_data));
      } catch (error) {
        console.error('[fill] Failed to load inspection:', error);
        Alert.alert('Error', 'No se pudo cargar la inspección.');
        router.back();
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [id]);

  useEffect(() => {
    if (!inspection) return;

    const subscription = watch((values) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          setIsSaving(true);
          setSaveError(null);
          await updateInspection(id, {
            form_data: JSON.stringify(values),
            client_name: (values['cliente'] as string) || inspection.client_name,
            location: (values['location'] as string) || inspection.location,
            technician_name: (values['tecnico'] as string) || inspection.technician_name,
          });
        } catch (error) {
          console.error('[fill] Autosave failed:', error);
          setSaveError('Error al guardar. Verifica tu almacenamiento.');
        } finally {
          setIsSaving(false);
        }
      }, 500);
    });

    return () => {
      subscription.unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [inspection, id]);

  async function doComplete(currentValues: FieldValues): Promise<void> {
    try {
      setIsCompleting(true);

      await updateInspection(id, {
        form_data: JSON.stringify(currentValues),
        client_name: (currentValues['cliente'] as string) || inspection!.client_name,
        location: (currentValues['location'] as string) || inspection!.location,
        technician_name: (currentValues['tecnico'] as string) || inspection!.technician_name,
      });

      await updateStatus(id, 'completed');
      router.push(`/inspection/${id}/pdf-preview`);
    } catch (error) {
      console.error('[fill] Failed to complete inspection:', error);
      Alert.alert('Error', 'No se pudo completar la inspección. Intenta de nuevo.');
    } finally {
      setIsCompleting(false);
    }
  }

  // Checks if a field is empty (handles photos, signatures, and normal fields).
  function isFieldEmpty(field: FormFieldType, values: FieldValues): boolean {
    if (field.type === 'photo') return !photosByKey[field.key];
    if (field.type === 'signature') return !signaturesByType[signerTypeForField(field.key)];
    const value = values[field.key];
    return value === undefined || value === null || value === '';
  }

  async function handleComplete(): Promise<void> {
    if (!schema || !inspection) return;

    const currentValues = watch();
    const criticalMissing: string[] = []; // required:true → blocks completion
    const optionalMissing: string[] = [];  // required:false → soft warning only

    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (!isFieldEmpty(field, currentValues)) continue;
        if (field.required) {
          criticalMissing.push(field.label);
        } else {
          optionalMissing.push(field.label);
        }
      }
    }

    // Critical fields missing → hard block, cannot continue.
    if (criticalMissing.length > 0) {
      const listed = criticalMissing.map((l) => `• ${l}`).join('\n');
      Alert.alert(
        'Faltan campos obligatorios',
        `Debes completar antes de enviar:\n\n${listed}`,
        [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }

    // Only optional fields missing → soft warning with option to continue.
    if (optionalMissing.length > 0) {
      const MAX_SHOWN = 6;
      const listed = optionalMissing.slice(0, MAX_SHOWN).map((l) => `• ${l}`).join('\n');
      const remainder =
        optionalMissing.length > MAX_SHOWN
          ? `\n...y ${optionalMissing.length - MAX_SHOWN} campo(s) más`
          : '';

      Alert.alert(
        'Campos sin completar',
        `${listed}${remainder}\n\n¿Deseas continuar de todas formas?`,
        [
          { text: 'Revisar', style: 'cancel' },
          {
            text: 'Continuar',
            onPress: () => {
              doComplete(currentValues).catch(console.error);
            },
          },
        ]
      );
      return;
    }

    // Nothing missing — complete directly.
    await doComplete(currentValues);
  }

  function renderField(field: FormFieldType) {
    if (field.type === 'photo') {
      return (
        <View key={field.key} style={styles.mediaFieldWrapper}>
          <Text style={styles.mediaLabel}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <PhotoField
            inspectionId={id}
            fieldKey={field.key}
            label={field.label}
            photo={photosByKey[field.key] ?? null}
            onPhotoSaved={(photo) =>
              setPhotosByKey((prev) => ({ ...prev, [field.key]: photo }))
            }
            onPhotoDeleted={() =>
              setPhotosByKey((prev) => {
                const next = { ...prev };
                delete next[field.key];
                return next;
              })
            }
          />
        </View>
      );
    }

    if (field.type === 'signature') {
      const signerType = signerTypeForField(field.key);
      return (
        <View key={field.key} style={styles.mediaFieldWrapper}>
          <Text style={styles.mediaLabel}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <SignatureField
            inspectionId={id}
            signerType={signerType}
            label={field.label}
            signature={signaturesByType[signerType] ?? null}
            onSignatureSaved={(sig) =>
              setSignaturesByType((prev) => ({ ...prev, [sig.signer_type]: sig }))
            }
            onSignatureCleared={() =>
              setSignaturesByType((prev) => {
                const next = { ...prev };
                delete next[signerType];
                return next;
              })
            }
          />
        </View>
      );
    }

    return <FormField key={field.key} field={field} control={control} />;
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  if (!inspection || !schema) return null;

  const { filled, total } = computeProgress(schema, watchedValues, photosByKey, signaturesByType);
  const progressPct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Progress header */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {filled} / {total} campos{progressPct === 100 ? ' ✓' : ''}
        </Text>
      </View>

      <ScrollView>
        {schema.sections.map((section) => (
          <View key={section.id}>
            <SectionHeader title={section.title} />
            {section.fields.map(renderField)}
          </View>
        ))}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.completeButton, isCompleting && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={isCompleting}
            activeOpacity={0.8}
          >
            <Text style={styles.completeButtonText}>
              {isCompleting ? 'Guardando...' : 'Completar y Enviar'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {isSaving && (
        <View style={styles.savingBadge}>
          <Text style={styles.savingText}>Guardando...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#1e3a5f',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'right',
  },
  mediaFieldWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  mediaLabel: {
    fontSize: 14,
    color: '#374151',
  },
  required: {
    color: '#dc2626',
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  completeButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  savingBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  savingText: {
    color: '#ffffff',
    fontSize: 12,
  },
});
