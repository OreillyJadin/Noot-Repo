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
import { routeAfterAuth, ACCOUNT_UNAVAILABLE } from './postAuth';
import { getBiometricCapability, isBiometricEnabled, unlockWithBiometric } from './biometrics';

type Phase = 'checking' | 'locked' | 'open';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  // Web never gates; native starts in a brief "checking" splash to avoid a landing flash.
  const [phase, setPhase] = useState<Phase>(Platform.OS === 'web' ? 'open' : 'checking');
  // Why the overlay is showing a retry: the biometric check didn't pass, or it did (or wasn't
  // needed) and the account then couldn't be read.
  const [failed, setFailed] = useState<null | 'unlock' | 'unreachable'>(null);
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
      // Logged out → show the normal navigation (landing / sign-in).
      if (!userId) return setPhase('open');
      // Opted into biometric + hardware available → lock and prompt Face ID.
      if (enabled && cap.available) {
        setPhase('locked');
        void attemptUnlock();
        return;
      }
      // Authenticated but no biometric lock → skip the marketing landing and go
      // straight to their home (a returning user shouldn't have to tap "Log in").
      await enter();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to the home UNDER the overlay first, then lift it — otherwise dropping
  // the overlay briefly reveals the landing (with its "Log in" button) mid-navigation.
  // If the account can't be read, keep the overlay and offer a retry: opening the
  // navigation here would leave a signed-in user on the landing (ERR-001).
  const enter = async () => {
    setFailed(null);
    const routed = await routeAfterAuth(router, setRole);
    if (routed.ok) setPhase('open');
    else setFailed('unreachable');
  };

  const attemptUnlock = async () => {
    setFailed(null);
    const res = await unlockWithBiometric();
    if (res.ok) await enter();
    else setFailed('unlock'); // show retry + password fallback (never dead-end)
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
              <Text style={[styles.hint, { color: t.text2 }]}>
                {failed === 'unlock' ? 'Unlock to continue' : ACCOUNT_UNAVAILABLE}
              </Text>
              {/* Already unlocked → retry the read only, without prompting Face ID again. */}
              <Button label="Try again" onPress={failed === 'unlock' ? attemptUnlock : enter} />
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
