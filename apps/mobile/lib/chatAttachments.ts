// Attachment picking + upload for the chat composer (M1 chat.tsx / M2 chat_tutor.tsx).
// Both screens share this so the two perspectives can't drift apart.
//
// Upload happens at pick time, not at send time: the file lands in the private
// chat-attachments bucket immediately and the composer stages only the returned descriptor.
// Nothing is visible to the other person until sendMessage commits the message row, so an
// abandoned draft leaves an unreferenced object rather than a half-sent message.
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api, type OutgoingAttachment } from '@noot/core';
import { readUriBytes } from './bytes';

/** Mirrors the bucket's file_size_limit (migration 0021) — checked here for a kind message. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

interface Picked {
  uri: string;
  name: string;
  mimeType?: string | null;
}

async function pickImage(): Promise<Picked | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access to send a photo.');
      return null;
    }
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0]!;
  return { uri: a.uri, name: a.fileName || `photo-${a.width}x${a.height}.jpg`, mimeType: a.mimeType };
}

async function pickDocument(): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name || 'attachment', mimeType: a.mimeType };
}

/**
 * Ask photo-or-file, then pick. Web goes straight to the file input: react-native-web's
 * Alert has no buttons, and the input takes images anyway.
 */
async function pick(): Promise<Picked | null> {
  if (Platform.OS === 'web') return pickDocument();
  const choice = await new Promise<'photo' | 'file' | null>((resolve) => {
    Alert.alert('Add attachment', undefined, [
      { text: 'Photo', onPress: () => resolve('photo') },
      { text: 'File', onPress: () => resolve('file') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
  if (choice === 'photo') return pickImage();
  if (choice === 'file') return pickDocument();
  return null;
}

/**
 * Pick one attachment and upload it to `conversationId`'s folder.
 * @returns the uploaded descriptor to stage in the composer, or null if canceled / failed.
 */
export async function pickAndUploadChatAttachment(
  conversationId: string,
): Promise<OutgoingAttachment | null> {
  let picked: Picked | null = null;
  try {
    picked = await pick();
  } catch {
    Alert.alert('Could not open picker', 'Please try again.');
    return null;
  }
  if (!picked) return null;

  try {
    // Real bytes — `fetch(uri).blob()` yields a file-backed RN Blob that Storage writes as 0.
    const bytes = await readUriBytes(picked.uri);
    if (bytes.byteLength === 0) throw new Error('That file came through empty.');
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachments are limited to ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`);
    }
    return await api.chat.uploadAttachment(conversationId, bytes, picked.name, picked.mimeType);
  } catch (e) {
    Alert.alert('Attachment failed', e instanceof Error ? e.message : 'Please try again.');
    return null;
  }
}
