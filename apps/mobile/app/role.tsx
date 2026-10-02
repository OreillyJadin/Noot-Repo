// O4 Choose Role — ported from screens-shared.jsx (Role). One account holds both;
// pick what to start as. Student → S1 profile setup → Home; Tutor → T1 onboarding → … → Tutor Home.
// The choice is persisted to the shared app store so the whole app (tab bar, role-gated
// screens) reflects the active role. Every new account passes through here, so it's also
// where a friend's invite code is entered (optional; redeem_invite_code, 0040).
import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, Field, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { errText } from '../lib/errText';
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
  const [code, setCode] = useState('');
  const [redeemed, setRedeemed] = useState(false); // so Back → Continue doesn't redeem twice
  const [busy, setBusy] = useState(false);

  const onContinue = async () => {
    if (code.trim() && !redeemed) {
      setBusy(true);
      try {
        await api.credits.redeem(code);
        setRedeemed(true);
      } catch (e) {
        Alert.alert('Invite code not applied', errText(e, 'Please check the code and try again.'));
        return;
      } finally {
        setBusy(false);
      }
    }
    setRole(sel);
    // Student → profile setup (S1); tutor → verification onboarding (T1 → … → tutor_home).
    router.push(sel === 'student' ? '/student_profile' : '/t1');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.nav}>
        <Text numberOfLines={1} onPress={() => router.back()} style={[styles.back, { color: t.accent }]}>‹ Back</Text>
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

        <View style={{ marginTop: 14 }}>
          <Field
            label="Invite code (optional)"
            placeholder="NOOT-XXXXXX"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            hint={redeemed ? 'Applied — your friend gets credit after your first session.' : 'Got one from a friend? Enter it here.'}
          />
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <Button
          label={sel === 'student' ? 'Continue as Student' : 'Continue as Tutor'}
          onPress={onContinue}
          disabled={busy}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 16, fontWeight: '600', minWidth: 48 },
  navTitle: { fontSize: 16, fontWeight: '700' },
  body: { padding: 20, gap: 10 },
  h1: { fontSize: 25, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  actionBar: { padding: 20 },
});
