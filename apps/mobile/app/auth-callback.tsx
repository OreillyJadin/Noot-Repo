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

export default function AuthCallback() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // On web the real href carries the query/fragment; on native reconstruct the
      // deep link from the parsed route params so completeAuthFromUrl sees the code.
      const url =
        typeof window !== 'undefined' && window.location?.href
          ? window.location.href
          : Linking.createURL('/auth-callback', {
              queryParams: params as Record<string, string>,
            });

      const res = await auth.completeAuthFromUrl(url);
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
        router.replace('/set_password?mode=reset');
      } else {
        router.replace('/verified');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount; the inbound URL is fixed for this navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      {error ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.title, { color: t.text }]}>Couldn&apos;t sign you in</Text>
          <Text style={[styles.sub, { color: t.text2 }]}>{error}</Text>
          <Button label="Back to sign in" onPress={() => router.replace('/signup')} />
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
