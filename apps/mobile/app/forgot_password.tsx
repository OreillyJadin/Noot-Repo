// Forgot password — sends a Supabase reset email. The reset link deep-links back to
// /auth-callback with a `flow=recovery` marker, which the callback uses to route the
// user into the set-password step (reset mode) rather than sign-up onboarding.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, Field, useTheme } from '@noot/ui';
import { auth } from '@noot/core';

export default function ForgotPassword() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setError('Enter your campus email.'); return; }
    setBusy(true); setError(null);
    try {
      // Distinct redirect so /auth-callback knows this is a recovery, not a sign-up.
      const redirectTo = Linking.createURL('/auth-callback', { queryParams: { flow: 'recovery' } });
      const res = await auth.sendPasswordReset(trimmed, redirectTo);
      if (res.ok) setSent(true);
      else setError(res.error ?? "Couldn't send a reset link. Try again.");
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text numberOfLines={1} onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        <Text style={[styles.navTitle, { color: t.text }]}>Reset password</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!sent ? (
          <>
            <Text style={[styles.h1, { color: t.text }]}>Forgot your password?</Text>
            <Text style={[styles.sub, { color: t.text2 }]}>
              Enter your campus email and we&apos;ll send you a link to set a new one.
            </Text>
            <Field
              label="Campus email"
              placeholder="yourname@crimson.ua.edu"
              value={email}
              onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
              keyboardType="email-address"
            />
            {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}
            <Button label={busy ? 'Sending…' : 'Send reset link'} disabled={busy} onPress={handleSend} />
          </>
        ) : (
          <>
            <Text style={[styles.h1, { color: t.text }]}>Check your inbox</Text>
            <Text style={[styles.sub, { color: t.text2 }]}>
              We sent a reset link to {email}. Tap it to set a new password.
            </Text>
          </>
        )}
        <Text onPress={() => router.replace('/signin')} style={[styles.link, { color: t.accent }]}>
          Back to sign in
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
  sub: { fontSize: 15, lineHeight: 21 },
  link: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
