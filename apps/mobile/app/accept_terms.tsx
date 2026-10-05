// Accept the Terms of Use — for an account that has a password but no recorded acceptance.
//
// New accounts accept on the same screen they create their password (set_password.tsx), and
// Guideline 1.2 needs that agreement before anyone can post anything. Three ways an account
// gets a password without it: Forgot password after abandoning onboarding (a reset has no
// Terms checkbox), an acceptance that failed to save, and accounts older than the Terms.
// lib/postAuthRoute.ts sends all of them here instead of to a home, on every sign-in and
// every launch, until they accept.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Ic, useTheme } from '@noot/ui';
import { api, auth } from '@noot/core';
import { useApp } from '../lib/store';
import { routeAfterAuth, ACCOUNT_UNAVAILABLE } from '../lib/postAuth';
import { TERMS_VERSION, openLegal } from '../lib/legal';
import { forgetThisDevice } from '../lib/push';

export default function AcceptTerms() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recorded already (a retry after the step after it failed): don't write it twice.
  const [saved, setSaved] = useState(false);

  const handleContinue = async () => {
    if (!accepted) { setError('Please accept the Terms of Use to continue.'); return; }
    setBusy(true); setError(null);
    try {
      if (!saved) {
        try {
          await api.profile.acceptTerms(TERMS_VERSION);
          setSaved(true);
        } catch {
          setError("Couldn't record your agreement. Please tap continue again.");
          return;
        }
      }
      // Back through the same door: it reads the account again and now opens their home.
      if (!(await routeAfterAuth(router, setRole)).ok) setError(ACCOUNT_UNAVAILABLE);
    } catch {
      setError("Couldn't reach noot. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    // The device registers on sign-in, before this screen: take it back while the session exists.
    await forgetThisDevice();
    try { await auth.signOut(); } catch { /* leave regardless */ }
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.h1, { color: t.text }]}>One thing before you continue</Text>
        <Text style={[styles.sub, { color: t.text2 }]}>
          Using noot means agreeing to how we keep it safe for everyone. Please read and accept the terms below.
        </Text>

        <Pressable
          onPress={() => { setAccepted((v) => !v); if (error) setError(null); }}
          style={styles.termsRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="Accept the Terms of Use and Privacy Policy"
        >
          <View
            style={[
              styles.box,
              { backgroundColor: accepted ? t.accent : 'transparent', borderColor: accepted ? t.accent : t.borderStrong },
            ]}
          >
            {accepted ? <Ic name="check" size={13} color={t.onAccent} strokeWidth={3} /> : null}
          </View>
          <Text style={[styles.termsText, { color: t.text2 }]}>
            I agree to noot&apos;s{' '}
            <Text onPress={() => openLegal('terms')} style={{ color: t.accent, fontWeight: '600' }}>
              Terms of Use
            </Text>{' '}
            and{' '}
            <Text onPress={() => openLegal('privacy')} style={{ color: t.accent, fontWeight: '600' }}>
              Privacy Policy
            </Text>
            . noot has zero tolerance for objectionable content and abusive behavior.
          </Text>
        </Pressable>

        {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}

        <Button label={busy ? 'Saving…' : 'Agree & continue'} disabled={busy || !accepted} onPress={handleContinue} />
        <Text onPress={signOut} accessibilityRole="button" style={[styles.link, { color: t.text3 }]}>
          Not now — sign out
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 20, gap: 16, paddingTop: 40 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
  termsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  link: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
