// Sign up — verification only. Full name + campus email → a Supabase magic link that
// proves the .edu address is real. There is NO password here by design; the user
// sets their password later, inside onboarding (verified → set-password). The name
// rides along in the OTP's user_metadata so the handle_new_user trigger fills in
// public.users on first insert.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, Card, Field, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { useApp } from '../lib/store';

/** "Ada Lovelace" → ["Ada", "Lovelace"]; single word → first name only. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export default function SignUp() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearErr = () => { if (error) setError(null); };

  // DEV ONLY — seeded-account shortcuts (supabase/seed_demo.mjs). Stripped by __DEV__.
  const devLogin = async (kind: 'student' | 'tutor') => {
    const devEmail = kind === 'student' ? 'student@crimson.ua.edu' : 'sara@crimson.ua.edu';
    const res = await auth.devSignIn(devEmail, 'password123');
    if (!res.ok) { setError(res.error ?? 'Dev sign-in failed'); return; }
    setRole(kind);
    router.replace(kind === 'student' ? '/home' : '/tutor_home');
  };

  const handleSend = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) { setError('Enter your full name.'); return; }
    if (!trimmedEmail) { setError('Enter your campus email.'); return; }
    setBusy(true); setError(null);
    try {
      // noot://auth-callback on device, http://<host>/auth-callback on web — must be
      // on the project's redirect allow-list (config.toml / dashboard URL config).
      const redirectTo = Linking.createURL('/auth-callback');
      const { first, last } = splitName(trimmedName);
      const res = await auth.sendSignupVerification(trimmedEmail, first, last, redirectTo);
      if (res.ok) setSent(true);
      else setError(res.error ?? "Couldn't send the link. Try again.");
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        <Text style={[styles.navTitle, { color: t.text }]}>Sign up</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!sent ? (
          <>
            <Text style={[styles.h1, { color: t.text }]}>Create your account</Text>

            <Card style={{ backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
              <Text style={[styles.eyebrow, { color: t.accent }]}>WHY .EDU?</Text>
              <Text style={{ color: t.text2, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                noot is closed to verified students. No bots, no scrapers, no randoms.
              </Text>
            </Card>

            <Field
              label="Full name"
              placeholder="Ada Lovelace"
              value={name}
              onChangeText={(v) => { setName(v); clearErr(); }}
              autoCapitalize="words"
            />
            <Field
              label="School email"
              placeholder="yourname@crimson.ua.edu"
              value={email}
              onChangeText={(v) => { setEmail(v); clearErr(); }}
              keyboardType="email-address"
            />

            {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}

            <Button label={busy ? 'Sending…' : 'Send verification link'} disabled={busy} onPress={handleSend} />
            <Text style={[styles.hint, { color: t.text3 }]}>You&apos;ll set a password after verifying.</Text>

            <Text onPress={() => router.replace('/signin')} style={[styles.link, { color: t.text2, marginTop: 6 }]}>
              Already have an account? <Text style={{ color: t.accent, fontWeight: '700' }}>Sign in</Text>
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.h1, { color: t.text }]}>Check your inbox</Text>
            <Text style={[styles.sub, { color: t.text2 }]}>
              We sent a verification link to {email || 'your email'}. Tap it to continue and set your password.
            </Text>
            <Card style={{ alignItems: 'center', gap: 14 }}>
              <Text style={{ fontSize: 40 }}>✉️</Text>
              {/* DEV ONLY — fakes the deep link into onboarding; establishes NO session,
                  so it must never ship. Real magic-link deep-linking replaces it. */}
              {__DEV__ ? <Button label="Open the link (demo)" onPress={() => router.push('/verified')} /> : null}
              <Text onPress={() => setSent(false)} style={{ color: t.accent, fontWeight: '600' }}>Change details</Text>
            </Card>
          </>
        )}

        {__DEV__ ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Text style={{ color: t.text3, fontSize: 12, textAlign: 'center' }}>Dev shortcuts (skip verification)</Text>
            <Button label="Dev: sign in as student" kind="secondary" onPress={() => devLogin('student')} />
            <Button label="Dev: sign in as tutor" kind="secondary" onPress={() => devLogin('tutor')} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 16, fontWeight: '600', width: 48 },
  navTitle: { fontSize: 16, fontWeight: '700' },
  body: { padding: 20, gap: 16 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
  hint: { fontSize: 13, textAlign: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  link: { fontSize: 14, textAlign: 'center' },
});
