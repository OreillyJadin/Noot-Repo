// Profile-photo picker + upload. Opens the OS image library (a file input on web),
// uploads the chosen image via @noot/core, and returns the new public avatar URL.
// Screens use the return value to update the shown photo immediately.
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@noot/core';
import { base64ToArrayBuffer } from './bytes';

/** Extension for the picked asset, from its file name or mime type. */
function extensionFor(asset: ImagePicker.ImagePickerAsset): string {
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromMime = asset.mimeType?.split('/').pop()?.toLowerCase();
  if (fromMime && /^[a-z0-9]+$/.test(fromMime)) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  return 'jpg';
}

/**
 * Let the user pick a photo and upload it as their avatar.
 * @returns the new public URL, or null if they canceled / it failed.
 */
export async function pickAndUploadAvatar(): Promise<string | null> {
  // Ask for library permission on native (web uses a file input — no prompt needed).
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access to change your picture.');
      return null;
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    // Ask the picker for the bytes directly. Reading them back with `fetch(asset.uri).blob()`
    // gives a file-backed RN Blob, which Storage writes as a 0-byte object.
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0]!;
  const ext = extensionFor(asset);
  try {
    // Fallback covers a picker that ignored `base64`; arrayBuffer() keeps the bytes inline
    // rather than handing over a file handle.
    const body = asset.base64
      ? base64ToArrayBuffer(asset.base64)
      : await (await fetch(asset.uri)).arrayBuffer();
    if (body.byteLength === 0) throw new Error('The picked photo came through empty.');
    return await api.profile.uploadAvatar(body, ext, asset.mimeType);
  } catch (e) {
    Alert.alert(
      'Upload failed',
      e instanceof Error ? e.message : 'Could not upload your photo. Please try again.',
    );
    return null;
  }
}
