// Web: there's no Face ID / fingerprint unlock in the browser, so the lock is off. Same
// exports as lib/biometrics.ts, which keeps expo-local-authentication out of the web bundle.
export interface BiometricCapability {
  available: boolean;
  label: string;
}

export interface BiometricUnlockResult {
  ok: boolean;
  error?: string;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  return { available: false, label: 'Biometrics' };
}

export async function getSavedBiometricEmail(): Promise<string | null> {
  return null;
}

export async function isBiometricEnabled(): Promise<boolean> {
  return false;
}

export async function enableBiometric(_email: string): Promise<boolean> {
  return false;
}

export async function unlockWithBiometric(): Promise<BiometricUnlockResult> {
  return { ok: false, error: 'Biometric unlock is unavailable on web.' };
}

export async function clearBiometric(): Promise<void> {}
