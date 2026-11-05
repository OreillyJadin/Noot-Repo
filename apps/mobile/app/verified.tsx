// O3 Email Verified — ported from screens-shared.jsx (Verified). → Role.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Ic, ListSection, ListRow, useTheme } from '@noot/ui';

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
          <Ic name="check" color={t.good} />
          <Text style={[styles.h2, { color: t.text }]}>Email verified</Text>
        </View>

        <Text style={[styles.h1, { color: t.text, fontFamily: t.headingFont }]}>Three quick steps to get you matched.</Text>

        <View style={{ marginTop: 20 }}>
          <ListSection>
            {STEPS.map(([title, sub], i) => (
              <ListRow
                key={title}
                title={title}
                subtitle={sub}
                leading={<Text style={{ color: t.accent, fontSize: 15, fontWeight: '700' }}>{i + 1}</Text>}
                size="regular"
              />
            ))}
          </ListSection>
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
  h2: { fontSize: 17, fontWeight: '700' },
  h1: { fontSize: 28, maxWidth: 300, lineHeight: 34 },
  actionBar: { padding: 20 },
});
