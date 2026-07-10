// Face ID opt-in — shown once, right after a new user sets their password during
// onboarding. Always skippable. Enabling records the opt-in so the launch-time
// AuthGate (and the Sign in screen's manual button) will offer biometric unlock; the
// session itself is already persisted in the encrypted keystore (LargeSecureStore),
// so there's no separate token to stash. Then continue onboarding (→ role).
//
// Graceful fallback: if the device has no enrolled biometrics, we don't show a
// dead-end — we skip straight to the next onboarding step.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { getBiometricCapability, enableBiometric, type BiometricCapability } from '../lib/biometrics';

const NEXT = '/role'; // continue onboarding

export default function EnableFaceId() {
  const t = useTheme();
  const router = useRouter();
  const [cap, setCap] = useState<BiometricCapability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const c = await getBiometricCapability();
      if (!active) return;
      // No biometric hardware/enrolment → nothing to opt into; skip this step.
      if (!c.available) { router.replace(NEXT); return; }
      setCap(c);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = cap?.label ?? 'Face ID';

  const enable = async () => {
    setBusy(true);
    const me = await api.getMe().catch(() => null);
    if (me?.email) await enableBiometric(me.email);
    router.replace(NEXT);
  };

  const skip = () => router.replace(NEXT);

  // Still resolving capability (or redirecting away) → brief spinner, no flash of copy.
  if (!cap) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <View style={styles.hero}>
          <Text style={{ fontSize: 56 }}>🔒</Text>
          <Text style={[styles.h1, { color: t.text }]}>Turn on {label}?</Text>
          <Text style={[styles.sub, { color: t.text2 }]}>
            Sign in faster next time without typing your password. You can change this later in Settings.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label={busy ? 'Enabling…' : `Enable ${label}`} disabled={busy} onPress={enable} />
          <Button label="Not now" kind="secondary" disabled={busy} onPress={skip} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  h1: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  actions: { gap: 10 },
});
