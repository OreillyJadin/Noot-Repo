// Profile-photo picker + upload. Opens the OS image library (a file input on web),
// uploads the chosen image via @noot/core, and returns the new public avatar URL.
// Screens use the return value to update the shown photo immediately.
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@noot/core';

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
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0]!;
  try {
    const res = await fetch(asset.uri);
    const blob = await res.blob();
    const ext = asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg';
    return await api.profile.uploadAvatar(blob, ext);
  } catch {
    Alert.alert('Upload failed', 'Could not upload your photo. Please try again.');
    return null;
  }
}
