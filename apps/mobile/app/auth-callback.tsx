// Magic-link return target. Supabase emails a link back to this route
// (noot://auth-callback on device, http://<host>/auth-callback on web) carrying a
// PKCE `?code=`. We exchange it for a session, then route: users who've finished
// onboarding land on their home; brand-new users start the onboarding flow.
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { useApp } from '../lib/store';
import { routeAfterAuth, ACCOUNT_UNAVAILABLE } from '../lib/postAuth';
import { authLinks } from '../lib/authLinks';

export default function AuthCallback() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setRole } = useApp();
  const [error, setError] = useState<string | null>(null);
  // Set when the account couldn't be read (not a bad link): offer a retry, bumped to re-run.
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const unavailable = () => {
        if (cancelled) return;
        setUnreachable(true);
        setError(ACCOUNT_UNAVAILABLE);
      };

      // On web the real href carries the query/fragment; on native reconstruct the
      // deep link from the parsed route params so completeAuthFromUrl sees the code.
      const url =
        typeof window !== 'undefined' && window.location?.href
          ? window.location.href
          : Linking.createURL('/auth-callback', {
              queryParams: params as Record<string, string>,
            });

      // A link this device already used — a duplicate delivery, or the app reopened at the
      // same launch URL after a force-close (T2). Its code is spent, so don't re-enter the
      // flow: finish an unfinished reset, otherwise go where a signed-in user belongs.
      const prior = await authLinks.state(params);
      if (cancelled) return;
      if (prior !== 'new') {
        const signedIn = !!(await auth.getSessionUserId());
        if (cancelled) return;
        if (!signedIn) router.replace('/signin');
        else if (params.flow === 'recovery' && prior === 'used') {
          authLinks.setRecoveryLink(params);
          router.replace('/set_password?mode=reset');
        } else if (!(await routeAfterAuth(router, setRole)).ok) unavailable();
        return;
      }

      // Already signed in before this link was exchanged → the link isn't what signs them in.
      // completeAuthFromUrl reports that as success, so it must not be read as a new sign-up.
      const alreadySignedIn = !!(await auth.getSessionUserId());
      if (cancelled) return;

      // Shared across duplicate mounts of this screen for the same link.
      const res = await authLinks.exchangeOnce(params, () => auth.completeAuthFromUrl(url));
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error ?? 'This sign-in link is invalid or expired.');
        return;
      }

      // Session established. This callback is only reached by two flows now (sign-in
      // is email+password, no magic link): a password RESET → set a new password, or
      // a sign-up VERIFICATION → onboarding, which starts by setting the password.
      if (cancelled) return;
      if (params.flow === 'recovery') {
        authLinks.setRecoveryLink(params);
        router.replace('/set_password?mode=reset');
      } else {
        // A new account goes on to create its password (/verified). One that already has is
        // here on a replayed link (the platform re-delivering the launch URL after a quit, on
        // a device whose link ledger doesn't know it) and goes home instead — ERR-001.
        // routeAfterAuth also claims the friend's code typed at sign-up, on this first sign-in,
        // before they can book anything (the claim is refused after a first booking).
        const routed = await routeAfterAuth(router, setRole);
        if (cancelled || routed.ok) return;
        // Couldn't read the account. A link that just signed them in is spent, so carry on
        // into onboarding as before; a session that was already there can simply retry.
        if (alreadySignedIn) unavailable();
        else router.replace('/verified');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs on mount (the inbound URL is fixed for this navigation) and again on "Try again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      {error ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.title, { color: t.text }]}>
            {unreachable ? "Couldn't load your account" : "Couldn't sign you in"}
          </Text>
          <Text style={[styles.sub, { color: t.text2 }]}>{error}</Text>
          {unreachable ? (
            <>
              <Button
                label="Try again"
                onPress={() => { setError(null); setUnreachable(false); setAttempt((n) => n + 1); }}
              />
              {/* Never a dead end if the failure isn't the network after all. */}
              <Button label="Back to sign in" kind="secondary" onPress={() => router.replace('/signin')} />
            </>
          ) : (
            <Button label="Back to sign in" onPress={() => router.replace('/signup')} />
          )}
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.accent} />
          <Text style={[styles.sub, { color: t.text2 }]}>Signing you in…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
});
