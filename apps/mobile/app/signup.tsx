// O2 Sign Up — ported from screens-shared.jsx (SignUp). .edu email → magic link.
// Demo: "Send magic link" flips to the check-inbox state; "Open the link" → Verified.
// Real wiring later: @noot/core auth.sendMagicLink(email).
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, Field, useTheme } from '@noot/ui';

export default function SignUp() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        <Text style={[styles.navTitle, { color: t.text }]}>Sign Up</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!sent ? (
          <>
            <Text style={[styles.h1, { color: t.text }]}>What&apos;s your campus email?</Text>
            <Text style={[styles.sub, { color: t.text2 }]}>We&apos;ll send you a magic link to verify it&apos;s really you.</Text>

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
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <Text style={{ color: t.text3, fontSize: 13 }}>Must be a verified .edu address from your school.</Text>
            <Button label="Send magic link" onPress={() => setSent(true)} />
          </>
        ) : (
          <>
            <Text style={[styles.h1, { color: t.text }]}>Check your inbox</Text>
            <Text style={[styles.sub, { color: t.text2 }]}>
              We sent a magic link to {email || 'your email'}. Tap it to continue.
            </Text>
            <Card style={{ alignItems: 'center', gap: 14 }}>
              <Text style={{ fontSize: 40 }}>✉️</Text>
              <Button label="Open the link (demo)" onPress={() => router.push('/verified')} />
              <Text onPress={() => setSent(false)} style={{ color: t.accent, fontWeight: '600' }}>Change email</Text>
            </Card>
          </>
        )}
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
