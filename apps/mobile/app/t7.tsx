// T7 Tutor Agreement — ported from screens-tutor.jsx (T7). Independent
// contractor agreement + e-signature. Step 7 of the tutor application.
// → T8 Payout setup. "Save & exit" → Landing.
// Shows the agreement text (placeholder for now — lib/tutorAgreement.ts), and can't be
// passed until every box is ticked and a name typed; signing is recorded server-side (T4).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Field, Divider, Eyebrow, Label, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { api, AGREEMENT_VERSION } from '@noot/core';
import { useMe, fullName } from '../lib/useMe';
import { useTutorApplication } from '../lib/useTutorApplication';
import { AGREEMENT_TITLE, AGREEMENT_SECTIONS, AGREEMENT_CHECKS } from '../lib/tutorAgreement';
import { errText } from '../lib/errText';


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
  const { app } = useTutorApplication();
  // Every box starts unticked — they used to start two-thirds pre-ticked.
  const [checks, setChecks] = useState<boolean[]>(AGREEMENT_CHECKS.map(() => false));
  const [signature, setSignature] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [signing, setSigning] = useState(false);
  useEffect(() => {
    if (me && !prefilled) { setSignature(fullName(me, '')); setPrefilled(true); }
  }, [me, prefilled]);

  const signedAt = app?.agreementSignedAt ?? null;
  const allChecked = checks.every(Boolean);
  const canSign = allChecked && signature.trim().length > 0;
  const toggle = (i: number) => setChecks((c) => c.map((v, ci) => (ci === i ? !v : v)));
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const sign = async () => {
    if (!canSign || signing) return;
    setSigning(true);
    try {
      // The server stamps the time and records the agreement version (0038).
      await api.profile.signAgreement(signature.trim(), AGREEMENT_VERSION);
      router.push('/t8');
    } catch (e) {
      Alert.alert('Could not sign', errText(e, 'Please check your connection and try again.'));
    } finally {
      setSigning(false);
    }
  };

  return (
    <Screen>
      <StepHead step={7} title="Tutor Agreement" onBack={() => router.back()} onExit={() => router.replace('/')} />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Card flat style={styles.agreementCard}>
          <Eyebrow style={{ color: t.text3, marginBottom: 10 }}>{AGREEMENT_TITLE}</Eyebrow>
          <ScrollView nestedScrollEnabled style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
            {AGREEMENT_SECTIONS.map((sec) => (
              <View key={sec.heading}>
                <Text style={[styles.secHead, { color: t.text }]}>{sec.heading}</Text>
                <Text style={[styles.secBody, { color: t.text2 }]}>{sec.body}</Text>
              </View>
            ))}
          </ScrollView>
        </Card>

        {signedAt ? (
          <Card flat style={[styles.signedCard, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
            <Ic name="check" size={18} color={t.accent} strokeWidth={2.4} />
            <Text style={[styles.signedText, { color: t.text2 }]}>
              Signed by <Text style={{ fontWeight: '700', color: t.text }}>{app?.agreementSignedName}</Text> on{' '}
              {new Date(signedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.
            </Text>
          </Card>
        ) : (
          <>
            <View style={{ gap: 12, marginTop: 16 }}>
              {AGREEMENT_CHECKS.map((item, i) => (
                <Pressable
                  key={item}
                  onPress={() => toggle(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: checks[i] }}
                  style={styles.checkRow}
                >
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
            <Field placeholder="Type your full name" value={signature} onChangeText={setSignature} autoCapitalize="words" />
            <Text style={[styles.signedHint, { color: t.text3 }]}>Signing today, {today}</Text>
          </>
        )}
      </Body>
      <ActionBar>
        {signedAt ? (
          <Button label="Continue" kind="primary" full onPress={() => router.push('/t8')} />
        ) : (
          <Button
            label={signing ? 'Signing…' : !allChecked ? 'Check all boxes to sign' : !signature.trim() ? 'Type your name to sign' : 'Sign and Continue'}
            kind="primary"
            full
            disabled={!canSign || signing}
            onPress={sign}
          />
        )}
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
  agreementCard: { padding: 14, height: 240, overflow: 'hidden' },
  secHead: { fontSize: 13.5, fontWeight: '700' },
  secBody: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  signedCard: { marginTop: 16, padding: 14, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  signedText: { flex: 1, fontSize: 14, lineHeight: 20 },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkLabel: { flex: 1, fontSize: 15, lineHeight: 21 },
  signedHint: { fontSize: 12, marginTop: 8 },
});
