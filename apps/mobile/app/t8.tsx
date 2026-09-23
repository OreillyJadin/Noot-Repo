// T8 Payout Setup (Stripe) — ported from screens-tutor.jsx (T8). Stripe Connect's hosted
// onboarding for payouts. Step 8 of the tutor application. → T9 Review profile.
// Continue unlocks only once Stripe reports payouts enabled (tracker T4); the old screen was
// a mock form whose SSN and bank fields went nowhere.
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, H2, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { openPayoutSetup } from '../lib/payoutSetup';

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

type Payouts = { connected: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean };

export default function T8() {
  const t = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<Payouts | null>(null);
  const [checking, setChecking] = useState(true);
  // Guards the double tap that used to create a second Stripe account (T24).
  const [opening, setOpening] = useState(false);

  // connect-status asks Stripe directly and caches the result server-side, which is what
  // the submit check (0038) reads. Re-checked on focus and after the browser closes.
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.connect.status());
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void check(); }, [check]));

  const setUp = async () => {
    if (opening) return;
    setOpening(true);
    try {
      if (await openPayoutSetup()) await check();
    } finally {
      setOpening(false);
    }
  };

  const ready = !!status?.payoutsEnabled;
  const statusLine = checking
    ? 'Checking with Stripe…'
    : ready
      ? 'Payouts are set up. You’re ready to continue.'
      : status?.connected
        ? 'Setup isn’t finished yet — Stripe still needs a few details.'
        : 'Not set up yet.';

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
            <H2 style={{ fontSize: 16, marginBottom: 8 }}>Set up payouts</H2>
            <Text style={[styles.lockText, { color: t.text2 }]}>
              Stripe will ask for your legal name, date of birth, the last 4 of your SSN and the bank account
              to pay you into. It takes about 5 minutes, then you come straight back here.
            </Text>
            <View style={styles.statusRow}>
              {checking ? (
                <ActivityIndicator size="small" color={t.text3} />
              ) : (
                <Ic name={ready ? 'check' : 'clock'} size={16} color={ready ? t.good : t.text3} strokeWidth={2.2} />
              )}
              <Text style={[styles.statusText, { color: ready ? t.good : t.text2 }]}>{statusLine}</Text>
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
        {ready ? (
          <Button label="Continue" kind="primary" full iconRight="chevron" onPress={() => router.push('/t9')} />
        ) : (
          <Button
            label={opening ? 'Opening Stripe…' : status?.connected ? 'Finish setup with Stripe' : 'Continue with Stripe'}
            kind="primary"
            full
            iconRight="chevron"
            disabled={opening || checking}
            onPress={setUp}
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
  stripeCard: { padding: 0, overflow: 'hidden' },
  stripeHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripeWordmark: { fontWeight: '800', fontSize: 14 },
  stripeBody: { padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  statusText: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  lockCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14 },
  lockText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
