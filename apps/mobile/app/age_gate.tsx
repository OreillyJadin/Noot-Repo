import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, useTheme } from '@noot/ui';
import { api, auth } from '@noot/core';
import { DateOfBirthPicker } from '../lib/DateOfBirthPicker';
import { isValidDob } from '../lib/age';
import { forgetThisDevice } from '../lib/push';
import { resetToSignedOut } from '../lib/resetToSignedOut';
import { useApp } from '../lib/store';
import { ACCOUNT_UNAVAILABLE, routeAfterAuth } from '../lib/postAuth';

export default function AgeGate() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!dateOfBirth || !isValidDob(dateOfBirth)) { setError('Select your date of birth.'); return; }
    setBusy(true);
    setError(null);
    try {
      const adult = await api.profile.confirmDateOfBirth(dateOfBirth);
      if (!adult) {
        router.replace('/under_age');
        return;
      }
      if (!(await routeAfterAuth(router, setRole)).ok) setError(ACCOUNT_UNAVAILABLE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your date of birth. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (busy || leaving) return;
    setLeaving(true);
    await forgetThisDevice();
    try { await auth.signOut(); } catch { /* leave regardless */ }
    resetToSignedOut(router);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: t.text }]}>Date of birth</Text>
        <Text style={[styles.body, { color: t.text2 }]}>
          noot is for people 18 and older. Select your date of birth to continue. You can&apos;t change it later.
        </Text>
        <DateOfBirthPicker
          value={dateOfBirth}
          onChange={(value) => { setDateOfBirth(value); setError(null); }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={busy ? 'Saving…' : 'Continue'} disabled={busy || leaving} onPress={handleContinue} />
        <Text onPress={signOut} accessibilityRole="button" style={[styles.link, { color: t.text3 }]}>
          Sign out
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, padding: 20, gap: 18, paddingTop: 32, paddingBottom: 28 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  error: { color: '#C0392B', fontSize: 14, lineHeight: 20 },
  link: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
