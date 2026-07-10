// Biometric (Face ID / Touch ID / fingerprint) unlock for returning users.
//
// Model: supabase-js persists the session in the encrypted keystore (LargeSecureStore)
// and auto-refreshes it, so a returning user is still authenticated after closing the
// app. Biometrics are a LOCK over that persisted session — a successful check lets the
// user back into their live session without typing a password. We store only a
// non-secret hint (the email) so the login screen can label the button and know an
// account opted in; the real credential is the OS-guarded session itself. This avoids
// refresh-token rotation/revocation pitfalls (a stored refresh token is revoked by
// signOut and rotated on every refresh).
//
// Purely additive and always skippable: no-op on web, and it never gates the
// password or magic-link flows — it just offers faster re-entry.
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { auth } from '@noot/core';

const EMAIL_KEY = 'noot.biometric.email'; // hint only (which account opted in), not a secret

const isNative = Platform.OS !== 'web';

export interface BiometricCapability {
  /** Hardware present, a biometric is enrolled, and we're on a native platform. */
  available: boolean;
  /** Human label for UI copy: 'Face ID', 'Touch ID', or 'Biometrics'. */
  label: string;
}

/** What the device supports right now. Safe to call anywhere (web → unavailable). */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (!isNative) return { available: false, label: 'Biometrics' };
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'Face ID'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'Touch ID'
        : 'Biometrics';
    return { available: hasHardware && enrolled, label };
  } catch {
    return { available: false, label: 'Biometrics' };
  }
}

/** The email of the account that enabled biometric unlock, or null. */
export async function getSavedBiometricEmail(): Promise<string | null> {
  if (!isNative) return null;
  try {
    return await SecureStore.getItemAsync(EMAIL_KEY);
  } catch {
    return null;
  }
}

/** True if some account has opted into biometric unlock on this device. */
export async function isBiometricEnabled(): Promise<boolean> {
  return (await getSavedBiometricEmail()) !== null;
}

/**
 * Opt this account into biometric unlock. Call after a successful sign-in / after a
 * new user sets their password, when the user chooses to enable it. The live
 * persisted session is the credential we later unlock; we only record the email.
 */
export async function enableBiometric(email: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    await SecureStore.setItemAsync(EMAIL_KEY, email.trim());
    return true;
  } catch {
    return false;
  }
}

export interface BiometricUnlockResult {
  ok: boolean;
  error?: string;
}

/**
 * Face ID / Touch ID gate over the persisted session. Fails (and forgets the hint)
 * if the session is gone — e.g. the user signed out or the refresh token expired —
 * so the caller falls back to the password sign-in screen.
 */
export async function unlockWithBiometric(): Promise<BiometricUnlockResult> {
  if (!isNative) return { ok: false, error: 'Biometric unlock is unavailable on web.' };
  if (!(await isBiometricEnabled())) return { ok: false, error: 'Biometric unlock is not set up.' };

  // Nothing to unlock if the persisted session is gone → make them sign in again.
  const userId = await auth.getSessionUserId();
  if (!userId) {
    await clearBiometric();
    return { ok: false, error: 'Your session expired — please sign in again.' };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock noot',
    cancelLabel: 'Use password',
    disableDeviceFallback: false,
  });
  if (!result.success) return { ok: false, error: 'Biometric check was cancelled.' }; // keep hint, allow retry
  return { ok: true };
}

/** Forget the opt-in (on disable, sign-out, or an expired session). */
export async function clearBiometric(): Promise<void> {
  if (!isNative) return;
  try {
    await SecureStore.deleteItemAsync(EMAIL_KEY);
  } catch {
    /* best-effort */
  }
}
