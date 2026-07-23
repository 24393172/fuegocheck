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
import { addPhoto, requestPhotoDeletion } from '../../lib/repositories/photos.repo';
import { generateId } from '../../lib/uuid';
import { Photo } from '../../types/inspection.types';

interface Props {
  inspectionId: string;
  fieldKey: string;
  label: string;
  photo: Photo | null;
  onPhotoSaved: (photo: Photo) => void;
  onPhotoDeleted: () => void;
  readOnly?: boolean;
}

export default function PhotoField({
  inspectionId,
  fieldKey,
  label,
  photo,
  onPhotoSaved,
  onPhotoDeleted,
  readOnly = false,
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

    let savedFiles: Awaited<ReturnType<typeof savePhoto>> | null = null;
    try {
      setIsCapturing(true);
      const photoId = generateId();
      const asset = result.assets[0];
      savedFiles = await savePhoto(
        inspectionId,
        asset.uri,
        photoId,
        asset.width,
        asset.height
      );
      const { localUri, thumbnailUri } = savedFiles;

      const pumpPrefix = fieldKey.includes(':') ? fieldKey.split(':')[0] : null;
      const pumpFormType = pumpPrefix === 'jockey'
        ? 'pump_jockey'
        : pumpPrefix === 'electrica'
          ? 'pump_electric'
          : pumpPrefix === 'diesel'
            ? 'pump_diesel'
            : null;
      const alarmFormType = pumpPrefix === 'tablero_ad'
        ? 'alarm_panel'
        : pumpPrefix === 'dispositivos_ad'
          ? 'addressed_devices'
          : pumpPrefix === 'dispositivos_convencionales'
            ? 'conventional_devices'
            : pumpPrefix === 'dispositivos_notificacion'
              ? 'notification_devices'
              : null;
      const isAnsul = pumpPrefix === 'ansul_r102';
      const saved = await addPhoto({
        id: photoId,
        inspection_id: inspectionId,
        field_key: fieldKey,
        local_uri: localUri,
        thumbnail_uri: thumbnailUri,
        caption: null,
        format_type: pumpFormType ? 'fire_pumps' : alarmFormType ? 'alarms' : isAnsul ? 'ansul' : pumpPrefix ?? 'legacy',
        form_type: pumpFormType ?? alarmFormType,
        item_id: null,
        location_name_snapshot: null,
        legacy: !fieldKey.includes(':'),
      });
      savedFiles = null;

      onPhotoSaved(saved);
    } catch (error) {
      if (savedFiles) await deletePhotoFiles(savedFiles.localUri, savedFiles.thumbnailUri).catch(() => {});
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
            const outcome = await requestPhotoDeletion(photo);
            if (outcome === 'deleted_local') await deletePhotoFiles(photo.local_uri, photo.thumbnail_uri);
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
        {!readOnly && <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
          <Text style={styles.deleteText}>Eliminar</Text>
        </TouchableOpacity>}
      </View>
    );
  }

  if (readOnly) return <Text style={styles.loadingText}>Sin fotografía</Text>;
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
    color: '#6b7280',
  },
});
