// O2 Sign Up / Sign in — ported from screens-shared.jsx (SignUp). .edu email → magic link.
// Auth is magic-link only (no passwords), so signing in and signing up are the SAME
// flow: enter your .edu email, get a link. The `?mode=login|signup` param only changes
// the copy so a "Log In" tap doesn't land on a page titled "Sign up".
// Real send goes through @noot/core auth.sendMagicLink (Supabase OTP); .edu domain
// gating is enforced server-side. "Open the link (demo)" still fakes the deep-link
// return until magic-link deep-linking lands.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Card, Field, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { useApp } from '../lib/store';

export default function SignUp() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isLogin = mode === 'login';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DEV ONLY — skip the magic-link round-trip and sign in with a seeded account
  // (see supabase/seed_demo.mjs). Stripped from production builds by __DEV__.
  const devLogin = async (kind: 'student' | 'tutor') => {
    const devEmail = kind === 'student' ? 'student@crimson.ua.edu' : 'sara@crimson.ua.edu';
    setError(null);
    const res = await auth.devSignIn(devEmail, 'password123');
    if (!res.ok) {
      setError(res.error ?? 'Dev sign-in failed');
      return;
    }
    setRole(kind);
    // Land where the real onboarding flow lands each role: student For-You home (S2),
    // tutor dashboard (TH).
    router.replace(kind === 'student' ? '/home' : '/tutor_home');
  };

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your campus email.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await auth.sendMagicLink(trimmed);
      if (res.ok) {
        setSent(true);
      } else {
        setError(res.error ?? "Couldn't send the link. Try again.");
      }
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        <Text style={[styles.navTitle, { color: t.text }]}>{isLogin ? 'Sign in' : 'Sign up'}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!sent ? (
          <>
            <Text style={[styles.h1, { color: t.text }]}>
              {isLogin ? 'Welcome back' : "What's your campus email?"}
            </Text>
            <Text style={[styles.sub, { color: t.text2 }]}>
              {isLogin
                ? "Enter your campus email and we'll send you a magic link to sign in."
                : "We'll send you a magic link to verify it's really you."}
            </Text>

            <Card style={{ backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
              <Text style={[styles.eyebrow, { color: t.accent }]}>WHY .EDU?</Text>
              <Text style={{ color: t.text2, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                noot is closed to verified students. No bots, no scrapers, no randoms.
              </Text>
            </Card>

            <Field
              label="Campus email"
              placeholder="yourname@crimson.ua.edu"
              value={email}
              onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
              keyboardType="email-address"
            />
            <Text style={{ color: t.text3, fontSize: 13 }}>Must be a verified .edu address from your school.</Text>
            {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}
            <Button
              label={sending ? 'Sending…' : 'Send magic link'}
              disabled={sending}
              onPress={handleSend}
            />
          </>
        ) : (
          <>
            <Text style={[styles.h1, { color: t.text }]}>Check your inbox</Text>
            <Text style={[styles.sub, { color: t.text2 }]}>
              We sent a magic link to {email || 'your email'}. Tap it to continue.
            </Text>
            <Card style={{ alignItems: 'center', gap: 14 }}>
              <Text style={{ fontSize: 40 }}>✉️</Text>
              {/* DEV ONLY — fake deep-link that walks the O3→O4 onboarding UI. It does NOT
                  establish a session (no devSignIn), so it must never ship: in production a
                  user would be advanced into the app unauthenticated. Real magic-link
                  deep-linking (TODO) replaces this. */}
              {__DEV__ ? (
                <Button label="Open the link (demo)" onPress={() => router.push('/verified')} />
              ) : null}
              <Text onPress={() => setSent(false)} style={{ color: t.accent, fontWeight: '600' }}>Change email</Text>
            </Card>
          </>
        )}

        {__DEV__ ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Text style={{ color: t.text3, fontSize: 12, textAlign: 'center' }}>Dev shortcuts (skip magic link)</Text>
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
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
