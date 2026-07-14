import {
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  comment: string;
  isSaving: boolean;
  onChangeComment: (comment: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PendingCommentDialog({
  visible,
  comment,
  isSaving,
  onChangeComment,
  onCancel,
  onConfirm,
}: Props) {
  const canConfirm = Boolean(comment.trim()) && !isSaving;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View
          style={styles.card}
          accessible
          accessibilityViewIsModal
          accessibilityLabel="Dejar formulario pendiente"
        >
          <Text style={styles.title}>Dejar como pendiente</Text>
          <Text style={styles.message}>
            Escribe el motivo por el que este formulario quedará pendiente.
          </Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={onChangeComment}
            placeholder="Comentario obligatorio"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoFocus
            editable={!isSaving}
            accessibilityLabel="Comentario para dejar pendiente"
          />
          <Text style={styles.requiredHint}>El comentario es obligatorio.</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={isSaving}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
              onPress={onConfirm}
              disabled={!canConfirm}
              accessibilityRole="button"
              accessibilityLabel="Confirmar formulario pendiente"
            >
              <Text style={styles.confirmButtonText}>
                {isSaving ? 'Guardando...' : 'Marcar pendiente'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    gap: 12,
    boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
  },
  title: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '800',
  },
  message: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 104,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    color: '#111827',
    backgroundColor: '#ffffff',
    fontSize: 15,
  },
  requiredHint: {
    color: '#b45309',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d97706',
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
