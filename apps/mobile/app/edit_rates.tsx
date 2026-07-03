// P4 Courses & Rates (Edit) — ported from screens-edit.jsx (EditRates). Tutor-only
// settings editor for per-course hourly rates. "Add a course" jumps to the tutor
// application's Courses step (T3). Save is a front-end stub → back().
// TODO(api): wire to @noot/core profile.updateRates(...).
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Ic, useTheme } from '@noot/ui';

interface Rate {
  code: string;
  grade: string;
  rate: number;
}

const INITIAL_RATES: Rate[] = [
  { code: 'CH 101', grade: 'A', rate: 25 },
  { code: 'CH 102', grade: 'A', rate: 30 },
];

export default function EditRates() {
  const t = useTheme();
  const router = useRouter();
  const [rates, setRates] = useState<Rate[]>(INITIAL_RATES);

  const bump = (i: number, d: number) =>
    setRates((rs) => rs.map((r, j) => (j === i ? { ...r, rate: Math.min(120, Math.max(10, r.rate + d)) } : r)));

  const save = () => {
    // TODO(api): persist rate changes.
    Alert.alert('Rates updated');
    router.back();
  };

  return (
    <Screen>
      <NavTop title="Courses & rates" onBack={() => router.back()} />
      <Body>
        <Text style={[styles.intro, { color: t.text2 }]}>
          Set an hourly rate per course. Changes apply to new bookings only — upcoming sessions keep the rate the
          student paid.
        </Text>

        <View style={{ gap: 10 }}>
          {rates.map((r, i) => (
            <Card key={r.code} style={{ padding: 14 }}>
              <View style={styles.row}>
                <View style={[styles.gradeBadge, { backgroundColor: t.accentWeak }]}>
                  <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>{r.grade}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{r.code}</Text>
                  <Text style={{ fontSize: 12, color: t.text3 }}>Grade {r.grade} verified</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => bump(i, -1)} style={[styles.stepBtn, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
                    <Ic name="minus" size={15} color={t.text} strokeWidth={2.2} />
                  </Pressable>
                  <Text style={styles.rateText}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>${r.rate}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: t.text3 }}>/hr</Text>
                  </Text>
                  <Pressable onPress={() => bump(i, 1)} style={[styles.stepBtn, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
                    <Ic name="plus" size={15} color={t.text} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}
        </View>

        <Card
          flat
          onPress={() => router.push('/t3')}
          style={{ marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt }}
        >
          <Ic name="plus" size={17} color={t.accent} strokeWidth={2.2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>Add a course</Text>
            <Text style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>New courses need grade verification (~24h)</Text>
          </View>
          <Ic name="chevR" size={16} color={t.text3} strokeWidth={2} />
        </Card>

        <View style={styles.footNote}>
          <View style={{ marginTop: 1 }}>
            <Ic name="bolt" size={14} color={t.accent} strokeWidth={1.8} />
          </View>
          <Text style={[styles.footNoteText, { color: t.text3 }]}>
            Most tutors on campus charge $22–$34/hr. You keep 100% during launch.
          </Text>
        </View>
      </Body>
      <ActionBar>
        <Button label="Save changes" full onPress={save} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gradeBadge: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rateText: { minWidth: 58, textAlign: 'center' },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 2 },
  footNoteText: { flex: 1, fontSize: 12, lineHeight: 17.4 },
});
