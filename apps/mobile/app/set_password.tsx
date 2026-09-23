// Set password — reused by two flows, both of which arrive here with a live session:
//   • onboarding (mode=onboarding, default): a newly-verified sign-up choosing their
//     first password → continues to the Face ID opt-in, then the rest of onboarding.
//   • reset (mode=reset): an existing user who followed a recovery link → sets a new
//     password and drops straight into the app.
// Requires an active session (the magic-link / recovery exchange already ran in
// /auth-callback); setPassword() operates on that session via updateUser.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Field, Ic, useTheme } from '@noot/ui';
import { api, auth } from '@noot/core';
import { useApp } from '../lib/store';
import { routeAfterAuth } from '../lib/postAuth';
import { markPasswordResetDone } from '../lib/authLinkOnce';
import { TERMS_VERSION, openLegal } from '../lib/legal';

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
  // Guideline 1.2 requires agreeing to terms with zero tolerance for objectionable
  // content before a user can post any. Onboarding only — someone resetting a forgotten
  // password accepted them when they signed up.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSubmit = async () => {
    if (password.length < MIN_LEN) { setError(`Use at least ${MIN_LEN} characters.`); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (!isReset && !acceptedTerms) { setError('Please accept the Terms of Use to continue.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await auth.setPassword(password);
      if (!res.ok) {
        setError(res.error ?? "Couldn't set your password. Try again.");
        return;
      }
      if (isReset) {
        // Existing user; already authenticated via the recovery session → into the app.
        // Recorded first, so a late duplicate of the reset link goes home (tracker T2).
        markPasswordResetDone();
        await routeAfterAuth(router, setRole);
      } else {
        // Record the acceptance before moving on, so no account can reach the rest of the
        // app without one. A failure here is not fatal to sign-up — surface it and let
        // them retry rather than trapping a user with a valid password on this screen.
        try {
          await api.profile.acceptTerms(TERMS_VERSION);
        } catch {
          setError("Couldn't record your agreement. Please tap continue again.");
          return;
        }
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

        {isReset ? null : (
          <Pressable
            onPress={() => { setAcceptedTerms((v) => !v); if (error) setError(null); }}
            style={styles.termsRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="Accept the Terms of Use and Privacy Policy"
          >
            <View
              style={[
                styles.box,
                {
                  backgroundColor: acceptedTerms ? t.accent : 'transparent',
                  borderColor: acceptedTerms ? t.accent : t.borderStrong,
                },
              ]}
            >
              {acceptedTerms ? <Ic name="check" size={13} color={t.onAccent} strokeWidth={3} /> : null}
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
        )}

        {error ? <Text style={{ color: '#C0392B', fontSize: 14 }}>{error}</Text> : null}

        <Button
          label={busy ? 'Saving…' : isReset ? 'Update password' : 'Set password & continue'}
          disabled={busy || (!isReset && !acceptedTerms)}
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
  termsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
});
