// T8 Payout Setup (Stripe) — ported from screens-tutor.jsx (T8). Identity +
// bank details for Stripe Connect payouts. Step 8 of the tutor application.
// → T9 Review profile. "Save & exit" → Landing.
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Field, H2, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';

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

export default function T8() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <StepHead
        step={8}
        title="Get paid"
        sub="Stripe handles your payouts and tax forms."
        onBack={() => router.back()}
        onExit={() => router.replace('/')}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Card style={styles.stripeCard}>
          <View style={[styles.stripeHeader, { backgroundColor: t.surface2, borderBottomColor: t.border }]}>
            <Text style={{ color: t.text3, fontSize: 12 }}>Powered by</Text>
            <Text style={[styles.stripeWordmark, { color: t.text }]}>stripe</Text>
          </View>
          <View style={styles.stripeBody}>
            <H2 style={{ fontSize: 16, marginBottom: 14 }}>Verify your identity</H2>
            <Field label="Legal name" value="Lindsay M. Thomas" />
            <View style={[styles.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Field label="Date of birth" value="01/14/2004" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="SSN (last 4)" value="•••• 4521" />
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <Field label="Bank account" placeholder="Routing + account number" />
            </View>
          </View>
        </Card>

        <Card flat style={[styles.lockCard, { backgroundColor: t.surfaceAlt }]}>
          <Ic name="lock" size={18} color={t.good} strokeWidth={1.7} />
          <Text style={[styles.lockText, { color: t.text2 }]}>
            Stripe is PCI-DSS compliant and issues your 1099-K at year-end.{' '}
            <Text style={{ color: t.text, fontWeight: '700' }}>noot never sees your SSN or bank info.</Text>
          </Text>
        </Card>
      </Body>
      <ActionBar>
        <Button label="Continue with Stripe" kind="primary" full iconRight="chevron" onPress={() => router.push('/t9')} />
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
  stripeCard: { padding: 0, overflow: 'hidden' },
  stripeHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripeWordmark: { fontWeight: '800', fontSize: 14 },
  stripeBody: { padding: 16 },
  row: { flexDirection: 'row', gap: 10 },
  lockCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14 },
  lockText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
