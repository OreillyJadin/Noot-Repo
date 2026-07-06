// O4 Choose Role — ported from screens-shared.jsx (Role). One account holds both;
// pick what to start as. Student → S1 profile setup → Home; Tutor → T1 onboarding → … → Tutor Home.
// The choice is persisted to the shared app store so the whole app (tab bar, role-gated
// screens) reflects the active role.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';

type RoleId = 'student' | 'tutor';

const ROLES: { id: RoleId; title: string; bullets: string[] }[] = [
  { id: 'student', title: "I'm a student", bullets: ['Search by course code', 'Filter by professor', 'Book a session in minutes'] },
  { id: 'tutor', title: 'I want to tutor', bullets: ['Upload grade transcript', 'Set your hourly rate', 'Earn a verified badge'] },
];

export default function Role() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const [sel, setSel] = useState<RoleId>('student');

  const onContinue = () => {
    setRole(sel);
    // Student → profile setup (S1); tutor → verification onboarding (T1 → … → tutor_home).
    router.push(sel === 'student' ? '/student_profile' : '/t1');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        <Text style={[styles.navTitle, { color: t.text }]}>Your role</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.h1, { color: t.text }]}>How will you start?</Text>
        <Text style={[styles.sub, { color: t.text2 }]}>
          One noot account holds both — you can add the other role anytime and switch modes from your profile.
        </Text>

        <View style={{ gap: 12, marginTop: 8 }}>
          {ROLES.map((r) => {
            const on = sel === r.id;
            return (
              <Card key={r.id} selected={on} onPress={() => setSel(r.id)}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: t.text }]}>{r.title}</Text>
                  <View style={[styles.radio, { borderColor: on ? t.accent : t.borderStrong, backgroundColor: on ? t.accent : 'transparent' }]}>
                    {on ? <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 12 }}>✓</Text> : null}
                  </View>
                </View>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {r.bullets.map((b) => (
                    <Text key={b} style={{ color: t.text2, fontSize: 14 }}>• {b}</Text>
                  ))}
                </View>
              </Card>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <Button
          label={sel === 'student' ? 'Continue as Student' : 'Continue as Tutor'}
          onPress={onContinue}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 16, fontWeight: '600', width: 48 },
  navTitle: { fontSize: 16, fontWeight: '700' },
  body: { padding: 20, gap: 10 },
  h1: { fontSize: 25, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  actionBar: { padding: 20 },
});
