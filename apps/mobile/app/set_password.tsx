// Set password — reused by two flows, both of which arrive here with a live session:
//   • onboarding (mode=onboarding, default): a newly-verified sign-up choosing their
//     first password → continues to the Face ID opt-in, then the rest of onboarding.
//   • reset (mode=reset): an existing user who followed a recovery link → sets a new
//     password and drops straight into the app.
// Requires an active session (the magic-link / recovery exchange already ran in
// /auth-callback); setPassword() operates on that session via updateUser.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Field, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { useApp } from '../lib/store';
import { routeAfterAuth } from '../lib/postAuth';

const MIN_LEN = 8;

export default function SetPassword() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isReset = mode === 'reset';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (password.length < MIN_LEN) { setError(`Use at least ${MIN_LEN} characters.`); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true); setError(null);
    try {
      const res = await auth.setPassword(password);
      if (!res.ok) {
        setError(res.error ?? "Couldn't set your password. Try again.");
        return;
      }
      if (isReset) {
        // Existing user; already authenticated via the recovery session → into the app.
        await routeAfterAuth(router, setRole);
      } else {
        // New user → offer Face ID, then continue onboarding (role → profile).
        router.replace('/enable_faceid');
      }
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.h1, { color: t.text }]}>
          {isReset ? 'Set a new password' : 'Create your password'}
        </Text>
        <Text style={[styles.sub, { color: t.text2 }]}>
          {isReset
            ? 'Choose a new password for your account.'
            : "You're verified! Set a password so you can sign in quickly next time."}
        </Text>

        <Field
          label="Password"
          placeholder={`At least ${MIN_LEN} characters`}
          value={password}
          onChangeText={(v) => { setPassword(v); if (error) setError(null); }}
          secureTextEntry
        />
        <Field
          label="Confirm password"
          placeholder="Re-enter your password"
          value={confirm}
          onChangeText={(v) => { setConfirm(v); if (error) setError(null); }}
          secureTextEntry
        />

        {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}

        <Button
          label={busy ? 'Saving…' : isReset ? 'Update password' : 'Set password & continue'}
          disabled={busy}
          onPress={handleSubmit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 20, gap: 16, paddingTop: 40 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
});
