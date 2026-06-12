import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { savePhoto, deletePhotoFiles } from '../../lib/photo-manager';
import { addPhoto, deletePhoto as deletePhotoRecord } from '../../lib/repositories/photos.repo';
import { generateId } from '../../lib/uuid';
import { Photo } from '../../types/inspection.types';

interface Props {
  inspectionId: string;
  fieldKey: string;
  label: string;
  photo: Photo | null;
  onPhotoSaved: (photo: Photo) => void;
  onPhotoDeleted: () => void;
}

export default function PhotoField({
  inspectionId,
  fieldKey,
  label,
  photo,
  onPhotoSaved,
  onPhotoDeleted,
}: Props) {
  const [isCapturing, setIsCapturing] = useState(false);

  async function requestAndLaunchCamera(): Promise<void> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Permiso requerido',
        'Se necesita acceso a la cámara para tomar fotos de la inspección.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    try {
      setIsCapturing(true);
      const photoId = generateId();
      const { localUri, thumbnailUri } = await savePhoto(
        inspectionId,
        result.assets[0].uri,
        photoId
      );

      const saved = await addPhoto({
        inspection_id: inspectionId,
        field_key: fieldKey,
        local_uri: localUri,
        thumbnail_uri: thumbnailUri,
        caption: null,
      });

      onPhotoSaved(saved);
    } catch (error) {
      console.error('[PhotoField] Failed to save photo:', error);
      Alert.alert('Error', 'No se pudo guardar la foto. Intenta de nuevo.');
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!photo) return;
    Alert.alert('Eliminar foto', '¿Deseas eliminar esta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all([
              deletePhotoRecord(photo.id),
              deletePhotoFiles(photo.local_uri, photo.thumbnail_uri),
            ]);
            onPhotoDeleted();
          } catch (error) {
            console.error('[PhotoField] Failed to delete photo:', error);
            Alert.alert('Error', 'No se pudo eliminar la foto.');
          }
        },
      },
    ]);
  }

  if (isCapturing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#1e3a5f" />
        <Text style={styles.loadingText}>Guardando foto...</Text>
      </View>
    );
  }

  if (photo) {
    return (
      <View style={styles.photoContainer}>
        <Image source={{ uri: photo.thumbnail_uri ?? photo.local_uri }} style={styles.thumbnail} />
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
          <Text style={styles.deleteText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.addButton} onPress={requestAndLaunchCamera} activeOpacity={0.7}>
      <Text style={styles.addIcon}>📷</Text>
      <Text style={styles.addText}>Tomar foto</Text>
      <Text style={styles.addSubtext}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  photoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  deleteText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '500',
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
    color: '#9ca3af',
  },
});
