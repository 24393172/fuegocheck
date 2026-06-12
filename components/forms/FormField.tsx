import { memo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Controller, Control, Path, FieldValues } from 'react-hook-form';
import { FormField as FormFieldType } from '../../types/form.types';
import YesNoNaField, { YesNoNaValue } from './YesNoNaField';

interface Props<T extends FieldValues> {
  field: FormFieldType;
  control: Control<T>;
}

// memo prevents re-rendering when the parent re-renders but this field's props
// haven't changed. With 93 fields in the form this makes a noticeable difference.
function FormFieldInner<T extends FieldValues>({ field, control }: Props<T>) {
  // Local toggle — tracks whether the optional comment box is expanded
  const [showComment, setShowComment] = useState(false);

  // Photo and signature fields are rendered by fill.tsx directly (media components)
  if (field.type === 'photo' || field.type === 'signature') {
    return null;
  }

  // Key for the optional comment stored alongside each yes_no_na field
  const commentKey = (field.key + '_comentario') as Path<T>;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>

      <Controller
        control={control}
        name={field.key as Path<T>}
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <View>
            {(field.type === 'text' || field.type === 'number') && (
              <TextInput
                style={[styles.input, error && styles.inputError]}
                value={(value as string) ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                placeholder={field.label}
                placeholderTextColor="#9ca3af"
              />
            )}

            {field.type === 'textarea' && (
              <TextInput
                style={[styles.input, styles.textarea, error && styles.inputError]}
                value={(value as string) ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                numberOfLines={4}
                placeholder={field.label}
                placeholderTextColor="#9ca3af"
                textAlignVertical="top"
              />
            )}

            {field.type === 'yes_no_na' && (
              <View>
                <YesNoNaField
                  value={value as YesNoNaValue}
                  onChange={onChange}
                />

                {/* Comment button — always visible, subtle to avoid accidental taps */}
                <Controller
                  control={control}
                  name={commentKey}
                  render={({ field: { value: commentVal, onChange: onCommentChange } }) => (
                    <View style={styles.commentArea}>
                      {showComment ? (
                        <View style={styles.commentInputWrapper}>
                          <TextInput
                            style={styles.commentInput}
                            value={(commentVal as string) ?? ''}
                            onChangeText={onCommentChange}
                            placeholder="Escribe un comentario..."
                            placeholderTextColor="#9ca3af"
                            multiline
                            numberOfLines={2}
                            textAlignVertical="top"
                            autoFocus
                          />
                          <TouchableOpacity
                            onPress={() => setShowComment(false)}
                            style={styles.doneButton}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.doneText}>Listo</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setShowComment(true)}
                          style={styles.commentChip}
                          activeOpacity={0.6}
                          hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
                        >
                          <Text style={styles.commentChipText}>
                            {commentVal
                              ? `💬 ${String(commentVal).slice(0, 40)}${String(commentVal).length > 40 ? '…' : ''}`
                              : '+ comentario'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                />
              </View>
            )}

            {error && <Text style={styles.errorText}>{error.message}</Text>}
          </View>
        )}
      />
    </View>
  );
}

const FormField = memo(FormFieldInner) as typeof FormFieldInner;
export default FormField;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#dc2626',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  textarea: {
    minHeight: 100,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 4,
  },

  // ── Optional comment (appears when "No" is selected) ───────────────────────
  commentArea: {
    marginTop: 6,
  },
  commentChip: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  commentChipText: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  commentInputWrapper: {
    gap: 6,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#eff6ff',
    minHeight: 56,
    textAlignVertical: 'top',
  },
  doneButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  doneText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
