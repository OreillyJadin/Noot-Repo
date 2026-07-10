// Launch-time biometric gate. Wraps the app's <Stack> in the root layout. On a cold
// launch, if a persisted session exists AND the user opted into biometric unlock AND
// the hardware is available, it shows a lock overlay and prompts Face ID / Touch ID;
// on success it drops the overlay and routes into the app. In every other case
// (no session, not opted in, biometrics unavailable, or the magic-link deep link is
// opening) it renders the normal navigation untouched — never a crash or dead-end.
//
// It's an OVERLAY, not a route, so it can't race expo-router's initial render and
// the public landing / /auth-callback screens stay reachable underneath.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Button, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { useApp } from './store';
import { routeAfterAuth } from './postAuth';
import { getBiometricCapability, isBiometricEnabled, unlockWithBiometric } from './biometrics';

type Phase = 'checking' | 'locked' | 'open';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  // Web never gates; native starts in a brief "checking" splash to avoid a landing flash.
  const [phase, setPhase] = useState<Phase>(Platform.OS === 'web' ? 'open' : 'checking');
  const [failed, setFailed] = useState(false);
  const ran = useRef(false); // guard against StrictMode double-mount double-prompting

  useEffect(() => {
    if (Platform.OS === 'web' || ran.current) return;
    ran.current = true;
    (async () => {
      // A magic-link / recovery deep link must reach /auth-callback — don't gate it.
      const initial = await Linking.getInitialURL();
      if (initial && initial.includes('auth-callback')) return setPhase('open');

      const [userId, cap, enabled] = await Promise.all([
        auth.getSessionUserId(),
        getBiometricCapability(),
        isBiometricEnabled(),
      ]);
      // Fall back to the normal screens unless we have a session + opt-in + hardware.
      if (!userId || !enabled || !cap.available) return setPhase('open');
      setPhase('locked');
      void attemptUnlock();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attemptUnlock = async () => {
    setFailed(false);
    const res = await unlockWithBiometric();
    if (res.ok) {
      setPhase('open');
      await routeAfterAuth(router, setRole);
    } else {
      setFailed(true); // show retry + password fallback (never dead-end)
    }
  };

  const usePassword = () => {
    setPhase('open');
    router.replace('/signin');
  };

  return (
    <View style={styles.flex}>
      {children}
      {phase !== 'open' ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: t.bg }]}>
          <Text style={[styles.brand, { color: t.text }]}>noot</Text>
          {!failed ? (
            <ActivityIndicator size="large" color={t.accent} />
          ) : (
            <View style={styles.actions}>
              <Text style={[styles.hint, { color: t.text2 }]}>Unlock to continue</Text>
              <Button label="Try again" onPress={attemptUnlock} />
              <Button label="Use password" kind="secondary" onPress={usePassword} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  brand: { fontSize: 34, fontWeight: '700', letterSpacing: -1 },
  actions: { gap: 10, width: '100%', maxWidth: 320 },
  hint: { fontSize: 15, textAlign: 'center' },
});
