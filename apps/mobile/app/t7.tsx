// T7 Tutor Agreement — ported from screens-tutor.jsx (T7). Independent
// contractor agreement + e-signature. Step 7 of the tutor application.
// → T8 Payout setup. "Save & exit" → Landing.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Field, Divider, Eyebrow, Label, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { useMe, fullName } from '../lib/useMe';

const LINE_WIDTHS = [100, 96, 100, 64, 100, 88, 92];
const ITEMS = ['I have read and agree to the Agreement.', 'I am responsible for my own taxes.', 'I am 18 years or older.'];

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

export default function T7() {
  const t = useTheme();
  const router = useRouter();
  const { me } = useMe();
  const [checks, setChecks] = useState<boolean[]>([true, true, false]);
  const [signature, setSignature] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (me && !prefilled) { setSignature(fullName(me, '')); setPrefilled(true); }
  }, [me, prefilled]);
  const allChecked = checks.every(Boolean);

  const toggle = (i: number) => setChecks((c) => c.map((v, ci) => (ci === i ? !v : v)));

  return (
    <Screen>
      <StepHead step={7} title="Tutor Agreement" onBack={() => router.back()} onExit={() => router.replace('/')} />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Card flat style={styles.agreementCard}>
          <Eyebrow style={{ color: t.text3, marginBottom: 10 }}>Independent Contractor Agreement</Eyebrow>
          {LINE_WIDTHS.map((w, i) => (
            <View key={i} style={[styles.agreementLine, { width: `${w}%`, backgroundColor: t.surface2 }]} />
          ))}
          <View style={[styles.scrollTrack, { backgroundColor: t.surface2 }]}>
            <View style={[styles.scrollThumb, { backgroundColor: t.accent }]} />
          </View>
        </Card>

        <View style={{ gap: 12, marginTop: 16 }}>
          {ITEMS.map((item, i) => (
            <Pressable key={item} onPress={() => toggle(i)} style={styles.checkRow}>
              <View
                style={[
                  styles.checkbox,
                  { borderColor: checks[i] ? t.accent : t.borderStrong, backgroundColor: checks[i] ? t.accent : 'transparent' },
                ]}
              >
                {checks[i] ? <Ic name="check" size={14} color={t.onAccent} strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.checkLabel, { color: t.text }]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        <Divider style={{ marginTop: 18, marginBottom: 14 }} />
        <Label>Sign by typing your full name</Label>
        <Field placeholder="Type your full name" value={signature} onChangeText={setSignature} />
        <Text style={[styles.signedHint, { color: t.text3 }]}>Signed May 14 · IP address captured</Text>
      </Body>
      <ActionBar>
        <Button
          label={allChecked ? 'Sign and Continue' : 'Check all boxes to sign'}
          kind="primary"
          full
          disabled={!allChecked}
          onPress={() => allChecked && router.push('/t8')}
        />
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
  agreementCard: { padding: 14, height: 132, overflow: 'hidden', position: 'relative' },
  agreementLine: { height: 7, borderRadius: 3, marginBottom: 7 },
  scrollTrack: { position: 'absolute', right: 8, top: 36, bottom: 14, width: 4, borderRadius: 2 },
  scrollThumb: { position: 'absolute', top: '15%', left: 0, right: 0, height: '32%', borderRadius: 2 },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkLabel: { flex: 1, fontSize: 15, lineHeight: 21 },
  signedHint: { fontSize: 12, marginTop: 8 },
});
