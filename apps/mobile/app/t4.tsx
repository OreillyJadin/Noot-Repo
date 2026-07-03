// T4 Set Your Rates — ported from screens-tutor.jsx (T4). Step 4 of the tutor
// application. → T5 Set availability. "Save & exit" → Landing.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, ProgressDots, H1, Sub, useTheme, Ic } from '@noot/ui';

interface RateRow {
  course: string;
  grade: string;
  rate: string;
}

const INIT_RATES: RateRow[] = [
  { course: 'CH 101', grade: 'A', rate: '25' },
  { course: 'CH 102', grade: 'A-', rate: '30' },
];

// Shared step header for T2–T9. Defined locally per-screen (no shared file).
function StepHead({
  step,
  title,
  sub,
  onBack,
  onExit,
}: {
  step: number;
  title?: string;
  sub?: string;
  onBack: () => void;
  onExit: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 4, backgroundColor: t.bg }}>
      <View style={styles.stepRow}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.stepBack}>
          <Ic name="back" size={22} color={t.accent} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.stepLabel, { color: t.text3 }]}>Step {step} of 10</Text>
        <Text onPress={onExit} style={[styles.stepExit, { color: t.accent }]}>Save & exit</Text>
      </View>
      <View style={styles.stepBody}>
        <ProgressDots total={10} current={step} />
        {title ? <H1 style={styles.stepTitle}>{title}</H1> : null}
        {sub ? <Sub style={styles.stepSub}>{sub}</Sub> : null}
      </View>
    </View>
  );
}

export default function T4() {
  const t = useTheme();
  const router = useRouter();
  const [rates, setRates] = useState<RateRow[]>(INIT_RATES);

  const setRate = (i: number, v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    setRates((rs) => rs.map((r, ri) => (ri === i ? { ...r, rate: digits } : r)));
  };

  const first = rates[0];
  const payout = first ? (Number(first.rate || '0') * 0.85).toFixed(2) : '0.00';

  return (
    <Screen>
      <StepHead
        step={4}
        title="Set your rates"
        sub="Charge what you're worth. Adjust anytime."
        onBack={() => router.back()}
        onExit={() => router.replace('/')}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <View style={{ gap: 10 }}>
          {rates.map((r, i) => (
            <Card key={r.course} style={styles.rateCard}>
              <View style={[styles.gradeChip, { backgroundColor: t.surface2 }]}>
                <Text style={[styles.gradeChipText, { color: t.text2 }]}>{r.grade}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.courseCode, { color: t.text }]}>{r.course}</Text>
                <Text style={[styles.perHour, { color: t.text3 }]}>per hour</Text>
              </View>
              <View style={[styles.rateBox, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
                <Text style={{ color: t.text3, fontSize: 15 }}>$</Text>
                <TextInput
                  value={r.rate}
                  onChangeText={(v) => setRate(i, v)}
                  keyboardType="numeric"
                  style={[styles.rateInput, { color: t.text }]}
                />
                <Text style={{ color: t.text3, fontSize: 12 }}>/hr</Text>
              </View>
            </Card>
          ))}
        </View>

        <Card flat style={[styles.infoCard, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
          <Text style={{ color: t.text2, fontSize: 13, lineHeight: 19 }}>
            <Text style={{ color: t.accent, fontWeight: '700' }}>You keep the majority of every session.</Text> You&apos;ll
            always see your exact payout before you accept — set your rate to what feels fair.
          </Text>
        </Card>

        {first ? (
          <Text style={[styles.payoutLine, { color: t.text2 }]}>
            Your payout for a 1-hour {first.course} session: <Text style={{ color: t.accent, fontWeight: '700' }}>${payout}</Text>
          </Text>
        ) : null}
      </Body>
      <ActionBar>
        <Button label="Save & Continue" kind="primary" full onPress={() => router.push('/t5')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingLeft: 8, paddingRight: 12 },
  stepBack: { paddingVertical: 6, paddingRight: 6 },
  stepLabel: { flex: 1, fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  stepExit: { fontSize: 13, fontWeight: '600', width: 78, textAlign: 'right' },
  stepBody: { paddingHorizontal: 20, paddingTop: 8 },
  stepTitle: { fontSize: 24, marginTop: 14 },
  stepSub: { marginTop: 6, fontSize: 14 },
  rateCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  gradeChip: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gradeChipText: { fontWeight: '700', fontSize: 13 },
  courseCode: { fontSize: 16, fontWeight: '600' },
  perHour: { fontSize: 13 },
  rateBox: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 13, borderWidth: 1.5 },
  rateInput: { width: 34, fontWeight: '700', fontSize: 19, textAlign: 'center', padding: 0 },
  infoCard: { marginTop: 14, padding: 14, borderWidth: 1 },
  payoutLine: { marginTop: 16, fontSize: 15 },
});
