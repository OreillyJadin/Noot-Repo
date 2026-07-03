// Home — placeholder destination after onboarding. In the real app this is the
// role-aware tab root (Home/Search/Sessions/Profile for students). For now it
// confirms the flow works end to end. See ARCHITECTURE.md §12 (tabs-as-roots).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Card, useTheme } from '@noot/ui';

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const isTutor = role === 'tutor';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.wordmark, { color: t.text }]}>noot</Text>
        <Text style={[styles.h1, { color: t.text }]}>
          {isTutor ? "You're set up to tutor 🦎" : 'Welcome to noot 🦎'}
        </Text>
        <Text style={[styles.sub, { color: t.text2 }]}>
          {isTutor
            ? 'Next: tutor dashboard, calendar, and grade verification.'
            : 'Next: your For-You home, search, and booking flow.'}
        </Text>

        <Card style={{ backgroundColor: t.surfaceAlt, marginTop: 8 }}>
          <Text style={{ color: t.text2, fontSize: 13, lineHeight: 19 }}>
            You just walked the full onboarding flow: Landing → Sign Up → Verified → Role → Home.
            The rest of the screens port in next from the design handoff.
          </Text>
        </Card>

        <Button label="Start over" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  wordmark: { fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
});
