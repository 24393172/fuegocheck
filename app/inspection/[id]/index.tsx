import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Inspection, Signature } from '../../../types/inspection.types';
import { FormSchema } from '../../../types/form.types';
import { getInspection, updateStatus } from '../../../lib/repositories/inspections.repo';
import { getSignaturesByInspection } from '../../../lib/repositories/signatures.repo';
import { getSiteData, parseFormData } from '../../../lib/form-data';
import { PUMP_SCHEMAS } from '../../../schemas';
import SignatureField from '../../../components/forms/SignatureField';

// Progress of one pump: how many yes/no/na questions are answered, and whether
// the pump has any data at all (so we know if it should go into the report).
function pumpProgress(schema: FormSchema, data: Record<string, unknown>) {
  let total = 0;
  let answered = 0;
  let hasAnyData = false;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const v = data[field.key];
      const filled = v !== undefined && v !== null && v !== '';
      if (filled) hasAnyData = true;
      if (field.type === 'yes_no_na') {
        total++;
        if (filled) answered++;
      }
    }
  }
  return { total, answered, hasAnyData };
}

export default function InspectionIndexScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [pumpsData, setPumpsData] = useState<Record<string, Record<string, unknown>>>({});
  const [signature, setSignature] = useState<Signature | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        try {
          const [insp, sigs] = await Promise.all([
            getInspection(id),
            getSignaturesByInspection(id),
          ]);
          if (cancelled) return;
          if (!insp) {
            Alert.alert('Error', 'No se encontró la inspección.');
            router.back();
            return;
          }
          const data = parseFormData(insp);
          setInspection(insp);
          setPumpsData((data.pumps ?? {}) as Record<string, Record<string, unknown>>);
          setSignature(sigs.find((s) => s.signer_type === 'technician') ?? null);
        } catch (error) {
          console.error('[inspection] Failed to load:', error);
          Alert.alert('Error', 'No se pudo cargar la inspección.');
          router.back();
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      }
      load();
      return () => { cancelled = true; };
    }, [id])
  );

  function handleComplete() {
    if (!inspection) return;

    const withData = PUMP_SCHEMAS
      .map((schema) => ({ schema, progress: pumpProgress(schema, pumpsData[schema.id] ?? {}) }))
      .filter((x) => x.progress.hasAnyData);

    if (withData.length === 0) {
      Alert.alert('Sin datos', 'Llena al menos una bomba antes de enviar.');
      return;
    }
    if (!signature) {
      Alert.alert('Falta la firma', 'Agrega la firma del técnico antes de enviar.');
      return;
    }

    async function go() {
      try {
        if (inspection!.status === 'draft') await updateStatus(id, 'completed');
        router.push(`/inspection/${id}/pdf-preview`);
      } catch (error) {
        console.error('[inspection] Failed to complete:', error);
        Alert.alert('Error', 'No se pudo continuar. Intenta de nuevo.');
      }
    }

    // Soft warning: a started pump with unanswered questions. The tech can still
    // send — this just prevents sending an incomplete report by accident.
    const incomplete = withData.filter((x) => x.progress.answered < x.progress.total);
    if (incomplete.length > 0) {
      const lines = incomplete
        .map((x) => `• ${x.schema.name}: ${x.progress.total - x.progress.answered} sin contestar`)
        .join('\n');
      Alert.alert(
        'Bombas incompletas',
        `${lines}\n\n¿Enviar de todas formas?`,
        [
          { text: 'Revisar', style: 'cancel' },
          { text: 'Enviar', onPress: () => { go(); } },
        ]
      );
      return;
    }

    go();
  }

  if (isLoading || !inspection) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  const site = getSiteData(inspection);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.client}>{site.cliente || 'Sin cliente'}</Text>
        <Text style={styles.meta}>
          {[site.area, site.fecha].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Bombas</Text>
      {PUMP_SCHEMAS.map((schema) => {
        const { total, answered, hasAnyData } = pumpProgress(schema, pumpsData[schema.id] ?? {});
        const complete = hasAnyData && answered === total;
        const statusText = !hasAnyData
          ? 'Sin empezar'
          : complete
            ? `Completa · ${answered}/${total}`
            : `En progreso · ${answered}/${total}`;
        const statusColor = !hasAnyData ? '#6b7280' : complete ? '#15803d' : '#b45309';

        return (
          <TouchableOpacity
            key={schema.id}
            style={styles.pumpRow}
            onPress={() => router.push(`/inspection/${id}/fill?pump=${schema.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.pumpInfo}>
              <Text style={styles.pumpName}>{schema.name}</Text>
              <Text style={[styles.pumpStatus, { color: statusColor }]}>{statusText}</Text>
            </View>
            <Text style={styles.chevron}>{complete ? '✓' : '›'}</Text>
          </TouchableOpacity>
        );
      })}

      <Text style={styles.sectionLabel}>Firma del técnico</Text>
      <View style={styles.signatureBox}>
        <SignatureField
          inspectionId={id}
          signerType="technician"
          label="Firma del técnico inspector"
          signature={signature}
          onSignatureSaved={(sig) => setSignature(sig)}
          onSignatureCleared={() => setSignature(null)}
        />
      </View>

      <TouchableOpacity style={styles.completeButton} onPress={handleComplete} activeOpacity={0.8}>
        <Text style={styles.completeButtonText}>
          {inspection.status === 'draft' ? 'Completar y enviar' : 'Ver / enviar reporte'}
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
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 4,
  },
  client: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  pumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  pumpInfo: {
    flex: 1,
  },
  pumpName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  pumpStatus: {
    fontSize: 13,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#9ca3af',
    marginLeft: 8,
  },
  signatureBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  completeButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
