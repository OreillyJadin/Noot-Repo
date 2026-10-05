// Sign up — verification only. Full name + campus email → a Supabase magic link that
// proves the .edu address is real. There is NO password here by design; the user
// sets their password later, inside onboarding (verified → set-password). The name
// rides along in the OTP's user_metadata so the handle_new_user trigger fills in
// public.users on first insert. An optional friend's invite code is kept on the device and
// claimed once they sign in from the link (lib/pendingInvite, 0040).
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, Card, Field, useTheme } from '@noot/ui';
import { api, auth } from '@noot/core';
import { useApp } from '../lib/store';
import { savePendingInvite } from '../lib/pendingInvite';
import { EmailCodeEntry } from '../lib/EmailCodeEntry';
import { routeAfterAuth, ACCOUNT_UNAVAILABLE } from '../lib/postAuth';

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
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'ok' | 'missing'>('idle');

  // Check the invite code as they type (debounced), so a typo shows up before the account
  // exists rather than silently losing their friend the credit.
  useEffect(() => {
    const c = code.trim();
    if (!c) { setCodeStatus('idle'); return; }
    setCodeStatus('checking');
    let alive = true;
    const timer = setTimeout(() => {
      api.credits
        .checkCode(c)
        .then((ok) => { if (alive) setCodeStatus(ok ? 'ok' : 'missing'); })
        .catch(() => { if (alive) setCodeStatus('idle'); });
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [code]);

  const clearErr = () => { if (error) setError(null); };

  const handleSend = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) { setError('Enter your full name.'); return; }
    if (!trimmedEmail) { setError('Enter your campus email.'); return; }
    if (codeStatus === 'missing') { setError('That invite code wasn’t found. Fix it, or clear it to continue.'); return; }
    if (codeStatus === 'checking') { setError('Still checking your invite code — try again in a moment.'); return; }
    setBusy(true); setError(null);
    try {
      // noot://auth-callback on device, http://<host>/auth-callback on web — must be
      // on the project's redirect allow-list (config.toml / dashboard URL config).
      const redirectTo = Linking.createURL('/auth-callback');
      const { first, last } = splitName(trimmedName);
      const res = await auth.sendSignupVerification(trimmedEmail, first, last, redirectTo);
      if (res.ok) {
        // A code known to be wrong was stopped above. If the check couldn't run (offline),
        // it's saved anyway: the server validates it when it's claimed.
        if (code.trim()) await savePendingInvite(code, trimmedEmail);
        setSent(true);
      }
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
        <Text numberOfLines={1} onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
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
            <Field
              label="Invite code (optional)"
              placeholder="NOOT-XXXXXX"
              value={code}
              onChangeText={(v) => { setCode(v); clearErr(); }}
              autoCapitalize="characters"
              hint={
                codeStatus === 'ok'
                  ? 'Code found ✓ — it’s applied when you open the link on this phone.'
                  : codeStatus === 'missing'
                    ? 'We couldn’t find that code.'
                    : codeStatus === 'checking'
                      ? 'Checking…'
                      : 'Got one from a friend? It can only be added now.'
              }
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
              We sent a verification link and a code to {email || 'your email'}. Tap the link on this phone, or
              enter the code below, to continue and set your password.
            </Text>
            {/* Same landing as the link: routeAfterAuth sends a new account on to create its
                password and claims the invite code typed above. */}
            <EmailCodeEntry
              email={email}
              kind="signup"
              onVerified={async () => ((await routeAfterAuth(router, setRole)).ok ? null : ACCOUNT_UNAVAILABLE)}
            />
            <Text onPress={() => setSent(false)} style={[styles.link, { color: t.accent, fontWeight: '600' }]}>
              Change details or send again
            </Text>
          </>
        )}

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
  hint: { fontSize: 13, textAlign: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  link: { fontSize: 14, textAlign: 'center' },
});
