// O3 Email Verified — ported from screens-shared.jsx (Verified). → Role.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, useTheme } from '@noot/ui';

const STEPS: [string, string][] = [
  ['Tell us who you are', 'Name, year, major'],
  ['Pick your role', 'Student or tutor'],
  ['Find your first tutor', 'Browse by course'],
];

export default function Verified() {
  const t = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.verifiedRow}>
          <View style={[styles.check, { backgroundColor: t.goodWeak }]}>
            <Text style={{ color: t.good, fontWeight: '700' }}>✓</Text>
          </View>
          <Text style={[styles.h2, { color: t.text }]}>Email verified</Text>
        </View>

        <Text style={[styles.h1, { color: t.text }]}>Three quick steps to get you matched.</Text>

        <View style={{ marginTop: 20 }}>
          {STEPS.map(([title, sub], i) => (
            <View key={title} style={[styles.step, { borderBottomColor: t.border, borderBottomWidth: i < 2 ? 1 : 0 }]}>
              <View style={[styles.num, { backgroundColor: t.accentWeak }]}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <View>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
                <Text style={{ color: t.text3, fontSize: 14, marginTop: 2 }}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <Text style={{ color: t.text3, fontSize: 13, textAlign: 'center', marginBottom: 8 }}>About 90 seconds</Text>
        <Button label="Let's go" onPress={() => router.push('/set_password')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 22, gap: 8 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  check: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  h2: { fontSize: 17, fontWeight: '700' },
  h1: { fontSize: 28, fontWeight: '700', maxWidth: 300, lineHeight: 34 },
  step: { flexDirection: 'row', gap: 14, paddingVertical: 16 },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionBar: { padding: 20 },
});
