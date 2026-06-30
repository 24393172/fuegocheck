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
import { Inspection, Photo } from '../../../types/inspection.types';
import { FormSchema } from '../../../types/form.types';
import { getInspection, updateInspection } from '../../../lib/repositories/inspections.repo';
import { getPhotosByInspection } from '../../../lib/repositories/photos.repo';
import { parseFormData } from '../../../lib/form-data';
import { PUMP_SCHEMAS } from '../../../schemas';
import { useInspectionStore } from '../../../store/inspection.store';
import FormField from '../../../components/forms/FormField';
import PhotoField from '../../../components/forms/PhotoField';
import SectionHeader from '../../../components/ui/SectionHeader';

// Photos are stored per pump so they don't collide between the pumps of one
// inspection: the field_key is prefixed with the pump id (e.g. "diesel:photo_general").
function photoKey(pump: string, fieldKey: string): string {
  return `${pump}:${fieldKey}`;
}

function computeProgress(
  schema: FormSchema,
  values: FieldValues,
  photos: Record<string, Photo>
): { filled: number; total: number } {
  let total = 0;
  let filled = 0;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      total++;
      if (field.type === 'photo') {
        if (photos[field.key]) filled++;
      } else {
        const v = values[field.key];
        if (v !== undefined && v !== null && v !== '') filled++;
      }
    }
  }
  return { filled, total };
}

export default function FillScreen() {
  const { id, pump } = useLocalSearchParams<{ id: string; pump: string }>();
  const router = useRouter();
  const { isSaving, saveError, setIsSaving, setSaveError } = useInspectionStore();

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [photosByKey, setPhotosByKey] = useState<Record<string, Photo>>({});

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValuesRef = useRef<FieldValues | null>(null);
  // The full form_data (site + every pump). Autosave only replaces this pump's
  // slice, so the other pumps and the site data are never overwritten.
  const fullDataRef = useRef<Record<string, unknown>>({});

  const { control, watch, reset } = useForm<FieldValues>({ defaultValues: {} });
  const watchedValues = useWatch({ control });

  useEffect(() => {
    async function load() {
      try {
        const s = PUMP_SCHEMAS.find((x) => x.id === pump) ?? null;
        if (!s) {
          Alert.alert('Error', 'Tipo de bomba no reconocido.');
          router.back();
          return;
        }
        const insp: Inspection | null = await getInspection(id);
        if (!insp) {
          Alert.alert('Error', 'No se encontró la inspección.');
          router.back();
          return;
        }

        const fullData = parseFormData(insp);
        if (!fullData.pumps || typeof fullData.pumps !== 'object') fullData.pumps = {};
        fullDataRef.current = fullData;

        const photos = await getPhotosByInspection(id);
        const prefix = `${pump}:`;
        const pumpPhotos: Record<string, Photo> = {};
        for (const p of photos) {
          if (p.field_key.startsWith(prefix)) {
            pumpPhotos[p.field_key.slice(prefix.length)] = p;
          }
        }

        setSchema(s);
        setPhotosByKey(pumpPhotos);
        const pumps = fullData.pumps as Record<string, Record<string, unknown>>;
        reset(pumps[pump] ?? {});
      } catch (error) {
        console.error('[fill] Failed to load:', error);
        Alert.alert('Error', 'No se pudo cargar la bomba.');
        router.back();
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [id, pump]);

  // Merges the current pump's values into the full form_data and persists it.
  function persist(values: FieldValues): Promise<void> {
    const pumps = (fullDataRef.current.pumps ?? {}) as Record<string, Record<string, unknown>>;
    fullDataRef.current = { ...fullDataRef.current, pumps: { ...pumps, [pump]: values } };
    return updateInspection(id, { form_data: JSON.stringify(fullDataRef.current) });
  }

  useEffect(() => {
    if (!schema) return;

    const subscription = watch((values) => {
      pendingValuesRef.current = values;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          setIsSaving(true);
          setSaveError(null);
          await persist(values);
          if (pendingValuesRef.current === values) pendingValuesRef.current = null;
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
      // Flush any unsaved changes so leaving the screen never loses data.
      const pending = pendingValuesRef.current;
      if (pending) {
        persist(pending).catch((error) => console.error('[fill] Flush on exit failed:', error));
      }
    };
  }, [schema, id, pump]);

  function renderField(field: FormSchema['sections'][number]['fields'][number]) {
    if (field.type === 'photo') {
      return (
        <View key={field.key} style={styles.mediaFieldWrapper}>
          <Text style={styles.mediaLabel}>{field.label}</Text>
          <PhotoField
            inspectionId={id}
            fieldKey={photoKey(pump, field.key)}
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

    return <FormField key={field.key} field={field} control={control} />;
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  if (!schema) return null;

  const { filled, total } = computeProgress(schema, watchedValues, photosByKey);
  const progressPct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <Text style={styles.pumpTitle}>{schema.name}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {filled} / {total} campos{progressPct === 100 ? ' ✓' : ''}
        </Text>
      </View>

      {saveError && (
        <View style={styles.saveErrorBanner}>
          <Text style={styles.saveErrorText}>⚠ {saveError}</Text>
        </View>
      )}

      <ScrollView>
        {schema.sections.map((section) => (
          <View key={section.id}>
            <SectionHeader title={section.title} />
            {section.fields.map(renderField)}
          </View>
        ))}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Listo</Text>
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
  pumpTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a5f',
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
  saveErrorBanner: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveErrorText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
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
  footer: {
    padding: 20,
    paddingBottom: 40,
  },
  doneButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
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
