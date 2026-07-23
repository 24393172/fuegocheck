import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { deletePhotoFiles, MAX_PHOTOS_PER_INSPECTION, MAX_PHOTOS_PER_ITEM, savePhoto } from '../../lib/photo-manager';
import { addPhoto, getPhotosByInspection, getPhotosForItem, requestPhotoDeletion, updatePhotoCaption } from '../../lib/repositories/photos.repo';
import { generateId } from '../../lib/uuid';
import { Photo } from '../../types/inspection.types';

interface Props {
  inspectionId: string;
  formatType: 'extintores' | 'hidrantes' | 'alarms';
  formType?: 'addressed_devices' | 'conventional_devices' | 'notification_devices';
  itemId: string;
  locationNameSnapshot: string;
  readOnly?: boolean;
  beforeCapture?: () => Promise<void>;
  canCapture?: boolean;
}

export default function EquipmentEvidenceField({ inspectionId, formatType, formType, itemId, locationNameSnapshot, readOnly = false, beforeCapture, canCapture = true }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);

  async function reload() { setPhotos(await getPhotosForItem(inspectionId, formatType, itemId)); }
  useEffect(() => { reload().catch(console.error); }, [inspectionId, formatType, itemId]);

  async function capture(replace?: Photo) {
    if (!canCapture) { Alert.alert('Captura datos primero', 'Registra al menos un dato del equipo antes de añadir evidencias.'); return; }
    const all = await getPhotosByInspection(inspectionId);
    if (!replace && photos.length >= MAX_PHOTOS_PER_ITEM) {
      Alert.alert('Límite alcanzado', `Puedes guardar hasta ${MAX_PHOTOS_PER_ITEM} fotografías por equipo.`); return;
    }
    if (!replace && all.length >= MAX_PHOTOS_PER_INSPECTION) {
      Alert.alert('Límite alcanzado', `Puedes guardar hasta ${MAX_PHOTOS_PER_INSPECTION} fotografías por inspección.`); return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para tomar evidencias.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const photoId = generateId();
    let savedFiles: Awaited<ReturnType<typeof savePhoto>> | null = null;
    try {
      setBusy(true);
      await beforeCapture?.();
      savedFiles = await savePhoto(inspectionId, asset.uri, photoId, asset.width, asset.height);
      await addPhoto({ id: photoId, inspection_id: inspectionId, format_type: formatType, form_type: formType ?? null, item_id: itemId,
        field_key: 'evidence', caption: replace?.caption ?? null,
        location_name_snapshot: locationNameSnapshot || null, local_uri: savedFiles.localUri,
        thumbnail_uri: savedFiles.thumbnailUri });
      savedFiles = null;
      if (replace) {
        const outcome = await requestPhotoDeletion(replace);
        if (outcome === 'deleted_local') await deletePhotoFiles(replace.local_uri, replace.thumbnail_uri);
      }
      await reload();
    } catch (error) {
      if (savedFiles) await deletePhotoFiles(savedFiles.localUri, savedFiles.thumbnailUri).catch(() => {});
      console.error('[equipment-evidence] Capture failed:', error);
      Alert.alert('Error', 'No se pudo guardar la fotografía en el dispositivo.');
    } finally { setBusy(false); }
  }

  function confirmDelete(photo: Photo) {
    Alert.alert('Eliminar fotografía', '¿Deseas eliminar esta evidencia? La eliminación se sincronizará con el servidor.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          const outcome = await requestPhotoDeletion(photo);
          if (outcome === 'deleted_local') await deletePhotoFiles(photo.local_uri, photo.thumbnail_uri);
          await reload();
        } catch { Alert.alert('Error', 'No se pudo eliminar la fotografía.'); }
      } },
    ]);
  }

  function changeCaption(photo: Photo, caption: string) {
    setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, caption } : item));
  }

  return <View style={styles.container}>
    <View style={styles.heading}><View><Text style={styles.title}>Evidencias fotográficas</Text><Text style={styles.help}>Hasta {MAX_PHOTOS_PER_ITEM} fotos. Se guardan sin conexión.</Text></View><Text style={styles.count}>{photos.length}/{MAX_PHOTOS_PER_ITEM}</Text></View>
    {photos.map((photo) => <View key={photo.id} style={styles.card}>
      <TouchableOpacity onPress={() => setPreview(photo)} accessibilityLabel="Abrir fotografía"><Image source={{ uri: photo.thumbnail_uri ?? photo.local_uri }} style={styles.thumbnail} /></TouchableOpacity>
      <View style={styles.details}>
        <TextInput editable={!readOnly} style={styles.caption} placeholder="Descripción opcional" value={photo.caption ?? ''} onChangeText={(value) => changeCaption(photo, value)} onEndEditing={(event) => { updatePhotoCaption(photo.id, event.nativeEvent.text.trim() || null).catch(console.error); }} maxLength={500} />
        <Text style={styles.sync}>{photo.sync_status === 'synced' ? 'Sincronizada' : photo.sync_status === 'error' ? 'Error al sincronizar' : 'Pendiente de sincronizar'}</Text>
        {!readOnly && <View style={styles.actions}><TouchableOpacity onPress={() => capture(photo)}><Text style={styles.replace}>Reemplazar</Text></TouchableOpacity><TouchableOpacity onPress={() => confirmDelete(photo)}><Text style={styles.delete}>Eliminar</Text></TouchableOpacity></View>}
      </View>
    </View>)}
    {!readOnly && photos.length < MAX_PHOTOS_PER_ITEM && <TouchableOpacity style={styles.add} disabled={busy} onPress={() => capture()}>{busy ? <ActivityIndicator color="#1f3f66" /> : <><Text style={styles.addTitle}>📷 Tomar fotografía</Text><Text style={styles.addHelp}>Se guardará en este dispositivo</Text></>}</TouchableOpacity>}
    {!photos.length && readOnly && <Text style={styles.empty}>Sin evidencias.</Text>}
    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}><View style={styles.modal}><TouchableOpacity style={styles.close} onPress={() => setPreview(null)}><Text style={styles.closeText}>Cerrar</Text></TouchableOpacity>{preview && <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={styles.previewWrap}><Image source={{ uri: preview.local_uri }} style={styles.preview} resizeMode="contain" /></ScrollView>}</View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, backgroundColor: '#fff' }, heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  title: { color: '#1f3f66', fontSize: 15, fontWeight: '800' }, help: { color: '#64748b', fontSize: 12, marginTop: 2 }, count: { color: '#475569', fontWeight: '800' },
  card: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }, thumbnail: { width: 92, height: 92, borderRadius: 9, backgroundColor: '#e2e8f0' },
  details: { flex: 1, gap: 7 }, caption: { minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 9, color: '#0f172a' }, sync: { color: '#64748b', fontSize: 11 }, actions: { flexDirection: 'row', gap: 18 }, replace: { color: '#1d4ed8', fontWeight: '700' }, delete: { color: '#dc2626', fontWeight: '700' },
  add: { minHeight: 76, borderWidth: 1, borderStyle: 'dashed', borderColor: '#94a3b8', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, addTitle: { color: '#1f3f66', fontWeight: '800' }, addHelp: { color: '#64748b', fontSize: 11, marginTop: 3 }, empty: { color: '#64748b' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: 44 }, close: { alignSelf: 'flex-end', padding: 16 }, closeText: { color: '#fff', fontWeight: '800' }, previewWrap: { flexGrow: 1, justifyContent: 'center' }, preview: { width: '100%', height: '100%' },
});
