// Notification permission and this device's push token (ERR-031).
//
// The in-app feed (app/notifications.tsx) has always worked; this is what lets the same
// notifications reach the phone when noot is closed: ask the system for permission, hand the
// device's Expo push token to the server (push_tokens), and take it back on sign-out. The
// server sends on every new notification row (migration 0045).
//
// A binary built before expo-notifications was added has no native module for it, and merely
// loading the library there is a fatal error (Metro reports a failed module load itself, so
// a try/catch around require() does not help). So the native module is looked for first, and
// the library is only loaded when it is there; otherwise everything here reads 'unavailable'.
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { api, auth } from '@noot/core';
import { pushStateOf, type PushState } from './pushState';

type Lib = typeof import('expo-notifications');
let cached: Lib | null | undefined;
function lib(): Lib | null {
  if (cached === undefined) {
    cached = null;
    try {
      if (requireOptionalNativeModule('ExpoPushTokenManager')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loaded = require('expo-notifications') as Lib;
        // Show a notification that arrives while the app is open, without a sound.
        loaded.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        cached = loaded;
      }
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** The token this device last registered, kept so sign-out can remove it while offline from Expo. */
const TOKEN_KEY = 'noot.pushToken';
/** `${userId}:${token}` of the last successful registration this launch — skip repeats. */
let registered: string | null = null;

export async function getPushState(): Promise<PushState> {
  const n = lib();
  if (!n) return 'unavailable';
  try {
    const p = await n.getPermissionsAsync();
    return pushStateOf({
      granted: p.granted,
      canAskAgain: p.canAskAgain,
      provisional: p.ios?.status === n.IosAuthorizationStatus.PROVISIONAL,
    });
  } catch {
    return 'unavailable';
  }
}

/** Show the system's permission prompt (only possible from 'ask'), then register if allowed. */
export async function askForPush(): Promise<PushState> {
  const n = lib();
  if (!n) return 'unavailable';
  try {
    // Android 13+ only shows its prompt once a channel exists.
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('default', { name: 'noot', importance: n.AndroidImportance.DEFAULT });
    }
    await n.requestPermissionsAsync();
  } catch {
    /* fall through to whatever the system now reports */
  }
  const state = await getPushState();
  // Not awaited: fetching the token talks to Apple and Expo, and the answer is already known.
  if (state === 'on') void registerThisDevice();
  return state;
}

/** The system's own page for noot — the only place a refused permission can be turned on. */
export function openPushSettings(): Promise<void> {
  return Linking.openSettings();
}

/**
 * Hand this device's token to the server for the signed-in account. Does nothing unless
 * notifications are allowed and someone is signed in; never throws (it runs on launch and
 * sign-in, and must not get in their way).
 */
export async function registerThisDevice(): Promise<void> {
  const n = lib();
  if (!n || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
  try {
    const uid = await auth.getSessionUserId();
    if (!uid || (await getPushState()) !== 'on') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await n.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    if (registered === `${uid}:${token}`) return;
    await api.notifications.registerPushToken(token, Platform.OS);
    registered = `${uid}:${token}`;
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* no token on a simulator, or offline — the next launch or sign-in tries again */
  }
}

/**
 * Stop this account's notifications coming to this device. Call BEFORE signing out (it needs
 * the session). Best effort and bounded: sign-out must not hang on a bad connection, and if
 * this doesn't get through, the next account to sign in on this phone takes the token over
 * anyway (0045).
 */
export async function forgetThisDevice(): Promise<void> {
  registered = null;
  const forget = async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await api.notifications.unregisterPushToken(token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  };
  try {
    await Promise.race([forget(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  } catch {
    /* best effort */
  }
}
