// Photo-library access with a way out of "denied" (tracker T3).
//
// Once a user denies access, iOS and Android stop showing the system prompt, and the old
// "Enable photo library access" alert had no button to do anything about it — a dead end.
// Now a denial offers Open Settings. When the user comes back we re-check and carry on to
// the picker if access was granted.
//
// Caveat: changing a privacy permission in Settings usually makes the OS terminate the app
// (always on iOS). Then there's no "coming back" — the app relaunches, the user lands on
// their home screen signed in (useMe reloads everything), and "Change photo" now works.
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** Resolve on the next return to the foreground. */
function nextForeground(): Promise<void> {
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

/**
 * True when the photo library can be opened. Prompts if it can; otherwise explains why
 * photos are needed (`reason`, e.g. "to change your picture") and offers Settings.
 */
export async function ensurePhotoAccess(reason: string): Promise<boolean> {
  if (Platform.OS === 'web') return true; // a file input, no permission
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.granted) return true;

  const openSettings = await new Promise<boolean>((resolve) => {
    Alert.alert(
      'Allow photo access',
      `noot needs access to your photos ${reason}. You can turn it on in Settings.`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Open Settings', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
  if (!openSettings) return false;

  const back = nextForeground();
  await Linking.openSettings();
  await back;
  const after = await ImagePicker.getMediaLibraryPermissionsAsync();
  return after.granted;
}
