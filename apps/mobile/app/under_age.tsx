import React, { useState } from 'react';
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, useTheme } from '@noot/ui';
import { auth } from '@noot/core';
import { forgetThisDevice } from '../lib/push';
import { resetToSignedOut } from '../lib/resetToSignedOut';

export default function UnderAge() {
  const t = useTheme();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const signOut = async () => {
    if (leaving) return;
    setLeaving(true);
    await forgetThisDevice();
    try { await auth.signOut(); } catch { /* leave regardless */ }
    resetToSignedOut(router);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: t.text }]}>noot is only available to people 18 and older</Text>
        <Text style={[styles.body, { color: t.text2 }]}>
          If you think this is a mistake, contact{' '}
          <Text
            accessibilityRole="link"
            onPress={() => { void Linking.openURL('mailto:support@trynoot.com').catch(() => {}); }}
            style={{ color: t.accent, fontWeight: '600' }}
          >
            support@trynoot.com
          </Text>
          .
        </Text>
        <Button label={leaving ? 'Signing out…' : 'Sign out'} disabled={leaving} onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 34 },
  body: { fontSize: 15, lineHeight: 22 },
});
