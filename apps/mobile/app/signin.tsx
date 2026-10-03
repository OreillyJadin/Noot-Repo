// Sign in — email + password only (no magic link here; magic link is sign-up
// verification only). Returning users with biometric enabled also get a manual
// "Use {Face ID}" button as a fallback to the launch-time AuthGate (e.g. if the
// auto-prompt was dismissed). Links out to Forgot password and Sign up.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Field, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { useApp } from '../lib/store';
import { routeAfterAuth, ACCOUNT_UNAVAILABLE } from '../lib/postAuth';
import {
  getBiometricCapability,
  getSavedBiometricEmail,
  unlockWithBiometric,
  type BiometricCapability,
} from '../lib/biometrics';

export default function SignIn() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual Face ID fallback: shown when an account opted in, hardware is available,
  // and a persisted session is still present to unlock.
  const [bioCap, setBioCap] = useState<BiometricCapability | null>(null);
  const [bioEmail, setBioEmail] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const [cap, saved, uid] = await Promise.all([
        getBiometricCapability(),
        getSavedBiometricEmail(),
        auth.getSessionUserId(),
      ]);
      if (!active) return;
      setBioCap(cap);
      setBioEmail(saved);
      setHasSession(!!uid);
    })();
    return () => { active = false; };
  }, []);
  const canBiometric = !!bioCap?.available && !!bioEmail && hasSession;

  const handleSignIn = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setError('Enter your campus email.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await auth.signInWithPassword(trimmed, password);
      if (!res.ok) { setError(res.error ?? "That email and password don't match."); return; }
      if (!(await routeAfterAuth(router, setRole, true)).ok) setError(ACCOUNT_UNAVAILABLE);
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleBiometric = async () => {
    setBusy(true); setError(null);
    const res = await unlockWithBiometric();
    if (res.ok) {
      if ((await routeAfterAuth(router, setRole)).ok) return;
      setError(ACCOUNT_UNAVAILABLE);
      setBusy(false);
    } else {
      setError(res.error ?? 'Biometric unlock failed.');
      const stillSaved = await getSavedBiometricEmail();
      setBioEmail(stillSaved);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text numberOfLines={1} onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        <Text style={[styles.navTitle, { color: t.text }]}>Sign in</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.h1, { color: t.text }]}>Welcome back</Text>

        <Field
          label="Campus email"
          placeholder="yourname@crimson.ua.edu"
          value={email}
          onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
          keyboardType="email-address"
        />
        <Field
          label="Password"
          placeholder="Your password"
          value={password}
          onChangeText={(v) => { setPassword(v); if (error) setError(null); }}
          secureTextEntry
        />

        <Text onPress={() => router.push('/forgot_password')} style={[styles.link, { color: t.accent }]}>
          Forgot password?
        </Text>

        {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}

        <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={handleSignIn} />

        {canBiometric ? (
          <>
            <View style={[styles.divider, { borderBottomColor: t.border }]}>
              <Text style={[styles.dividerText, { color: t.text3, backgroundColor: t.bg }]}>or</Text>
            </View>
            <Button
              label={`Use ${bioCap?.label ?? 'Face ID'}`}
              kind="secondary"
              disabled={busy}
              onPress={handleBiometric}
            />
          </>
        ) : null}

        <Text onPress={() => router.replace('/signup')} style={[styles.link, { color: t.text2, marginTop: 6 }]}>
          New here? <Text style={{ color: t.accent, fontWeight: '700' }}>Create account</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 16, fontWeight: '600', minWidth: 48 },
  navTitle: { fontSize: 16, fontWeight: '700' },
  body: { padding: 20, gap: 16 },
  h1: { fontSize: 26, fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  divider: { borderBottomWidth: 1, alignItems: 'center', marginVertical: 2 },
  dividerText: { fontSize: 12, fontWeight: '600', transform: [{ translateY: 8 }], paddingHorizontal: 10 },
});
