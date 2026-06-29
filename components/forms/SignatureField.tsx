import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureView, { SignatureViewRef } from 'react-native-signature-canvas';
import { saveSignature, deleteSignaturesByInspection } from '../../lib/repositories/signatures.repo';
import { Signature } from '../../types/inspection.types';

interface Props {
  inspectionId: string;
  signerType: 'technician' | 'client';
  label: string;
  signature: Signature | null;
  onSignatureSaved: (signature: Signature) => void;
  onSignatureCleared: () => void;
}

export default function SignatureField({
  inspectionId,
  signerType,
  label,
  signature,
  onSignatureSaved,
  onSignatureCleared,
}: Props) {
  const ref = useRef<SignatureViewRef>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  async function handleOK(base64DataUrl: string): Promise<void> {
    try {
      setIsCapturing(true);
      await deleteSignaturesByInspection(inspectionId);

      const saved = await saveSignature({
        inspection_id: inspectionId,
        signer_type: signerType,
        image_base64: base64DataUrl,
      });

      onSignatureSaved(saved);
      setModalVisible(false);
    } catch (error) {
      console.error('[SignatureField] Failed to save signature:', error);
      Alert.alert('Error', 'No se pudo guardar la firma. Intenta de nuevo.');
    } finally {
      setIsCapturing(false);
    }
  }

  function handleEmpty(): void {
    Alert.alert('Firma vacía', 'Dibuja tu firma antes de confirmar.');
  }

  function handleConfirm(): void {
    ref.current?.readSignature();
  }

  function handleClear(): void {
    ref.current?.clearSignature();
  }

  async function handleDelete(): Promise<void> {
    Alert.alert('Eliminar firma', '¿Deseas eliminar esta firma?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSignaturesByInspection(inspectionId);
            onSignatureCleared();
          } catch (error) {
            console.error('[SignatureField] Failed to delete signature:', error);
            Alert.alert('Error', 'No se pudo eliminar la firma.');
          }
        },
      },
    ]);
  }

  return (
    <View>
      {/* ── Preview / add button — always in the ScrollView, no WebView here ── */}
      {signature ? (
        <View style={styles.signatureContainer}>
          <Image
            source={{ uri: signature.image_base64 }}
            style={styles.signatureImage}
            resizeMode="contain"
          />
          <View style={styles.signatureActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>Volver a firmar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
              <Text style={styles.deleteText}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addIcon}>✍️</Text>
          <Text style={styles.addText}>Agregar firma</Text>
          <Text style={styles.addSubtext}>{label}</Text>
        </TouchableOpacity>
      )}

      {/* ── Modal — WebView lives here, completely isolated from the ScrollView ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{label}</Text>

          <SignatureView
            ref={ref}
            onOK={handleOK}
            onEmpty={handleEmpty}
            descriptionText="Firma aquí"
            clearText="Limpiar"
            confirmText="Confirmar"
            backgroundColor="#ffffff"
            penColor="#111827"
            style={styles.canvas}
            webviewContainerStyle={styles.canvas}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleClear} activeOpacity={0.7}>
              <Text style={styles.secondaryButtonText}>Limpiar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, isCapturing && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={isCapturing}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryButtonText}>
                {isCapturing ? 'Guardando...' : 'Confirmar firma'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelLink}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Preview / add ──────────────────────────────────────────────────────────
  signatureContainer: {
    gap: 8,
  },
  signatureImage: {
    width: '100%',
    height: 120,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  signatureActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f9fafb',
  },
  addIcon: {
    fontSize: 24,
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  addSubtext: {
    fontSize: 12,
    color: '#6b7280',
  },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    paddingBottom: 4,
  },
  canvas: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: '#6b7280',
    fontSize: 14,
  },

  // ── Shared buttons ─────────────────────────────────────────────────────────
  primaryButton: {
    flex: 1,
    backgroundColor: '#1e3a5f',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  deleteText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
});
