// T4 Set Your Rates — ported from screens-tutor.jsx (T4). Step 4 of the tutor
// application. → T5 Set availability. "Save & exit" → Landing.
//
// Lists the courses saved on step 3 and persists a rate for each (tracker T1). It used to
// start from a hard-coded CH 101 / CH 102 template and save nothing, so every tutor who
// finished onboarding had $0 courses that could never be booked.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, ProgressDots, H1, Sub, Skeleton, useTheme, Ic } from '@noot/ui';
import { api, tutorPayoutFor, MIN_HOURLY_RATE, MAX_HOURLY_RATE } from '@noot/core';

/** One course from step 3 with the rate being edited here (a string while typing). */
interface RateRow {
  courseCode: string;
  grade: string;
  rate: string;
  sessions: number;
}

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
  // The courses the tutor saved on step 3 — never a template. Empty until loaded.
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.profile
      .getMyTutorProfile()
      .then((p) => {
        if (!active) return;
        setRates(
          p.courses.map((c) => ({
            courseCode: c.courseCode,
            grade: c.grade ?? '',
            // A course added on step 3 has no rate yet (0) — show an empty box, not "$0".
            rate: c.hourlyRate > 0 ? String(c.hourlyRate) : '',
            sessions: c.sessions,
          })),
        );
      })
      .catch(() => { /* offline → empty; Continue explains what's missing */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const setRate = (i: number, v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    setRates((rs) => rs.map((r, ri) => (ri === i ? { ...r, rate: digits } : r)));
  };

  const invalid = rates.filter((r) => {
    const n = Number(r.rate);
    return !r.rate || n < MIN_HOURLY_RATE || n > MAX_HOURLY_RATE;
  });

  const persist = async (): Promise<boolean> => {
    try {
      await api.profile.setTutorCourses(
        rates.map((r) => ({
          courseCode: r.courseCode,
          grade: r.grade || null,
          // An unfinished rate is saved as 0 (not bookable) rather than dropped.
          hourlyRate: Number(r.rate) || 0,
          sessions: r.sessions,
        })),
      );
      return true;
    } catch {
      Alert.alert('Could not save your rates', 'Please check your connection and try again.');
      return false;
    }
  };

  const saveAndContinue = async () => {
    if (saving || loading) return;
    if (rates.length === 0) {
      Alert.alert('Add a course first', 'Go back a step and add the courses you tutor.');
      return;
    }
    if (invalid.length > 0) {
      Alert.alert(
        'Set a rate for every course',
        `Rates are $${MIN_HOURLY_RATE}–$${MAX_HOURLY_RATE}/hr. Check ${invalid.map((r) => r.courseCode).join(', ')}.`,
      );
      return;
    }
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (ok) router.push('/t5');
  };

  const saveAndExit = async () => {
    if (!loading && rates.length > 0) await persist();
    router.replace('/');
  };

  const first = rates.find((r) => Number(r.rate) > 0);
  // Verification happens on step 6, so show both takes (tracker T6).
  const payoutVerified = first ? tutorPayoutFor(Number(first.rate), true).toFixed(2) : null;
  const payoutUnverified = first ? tutorPayoutFor(Number(first.rate), false).toFixed(2) : null;

  return (
    <Screen>
      <StepHead
        step={4}
        title="Set your rates"
        sub="Charge what you're worth. Adjust anytime."
        onBack={() => router.back()}
        onExit={saveAndExit}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={62} radius={14} />
            <Skeleton height={62} radius={14} />
          </View>
        ) : rates.length === 0 ? (
          <Text style={{ fontSize: 14, color: t.text3 }}>
            No courses yet. Go back a step and add the courses you tutor.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {rates.map((r, i) => (
              <Card key={r.courseCode} style={styles.rateCard}>
                <View style={[styles.gradeChip, { backgroundColor: t.surface2 }]}>
                  <Text style={[styles.gradeChipText, { color: t.text2 }]}>{r.grade || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.courseCode, { color: t.text }]}>{r.courseCode}</Text>
                  <Text style={[styles.perHour, { color: t.text3 }]}>per hour</Text>
                </View>
                <View style={[styles.rateBox, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
                  <Text style={{ color: t.text3, fontSize: 15 }}>$</Text>
                  <TextInput
                    value={r.rate}
                    onChangeText={(v) => setRate(i, v)}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor={t.text3}
                    maxLength={3}
                    accessibilityLabel={`Hourly rate for ${r.courseCode}`}
                    style={[styles.rateInput, { color: t.text }]}
                  />
                  <Text style={{ color: t.text3, fontSize: 12 }}>/hr</Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        <Card flat style={[styles.infoCard, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
          <Text style={{ color: t.text2, fontSize: 13, lineHeight: 19 }}>
            <Text style={{ color: t.accent, fontWeight: '700' }}>You keep the majority of every session.</Text> You&apos;ll
            always see your exact payout before you accept — set your rate to what feels fair.
          </Text>
        </Card>

        {first && payoutVerified ? (
          <Text style={[styles.payoutLine, { color: t.text2 }]}>
            Your payout for a 1-hour {first.courseCode} session:{' '}
            <Text style={{ color: t.accent, fontWeight: '700' }}>${payoutVerified}</Text> with verified grades,{' '}
            ${payoutUnverified} without.
          </Text>
        ) : null}
      </Body>
      <ActionBar>
        <Button
          label={saving ? 'Saving…' : 'Save & Continue'}
          kind="primary"
          full
          disabled={saving || loading}
          onPress={saveAndContinue}
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
  rateCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  gradeChip: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gradeChipText: { fontWeight: '700', fontSize: 13 },
  courseCode: { fontSize: 16, fontWeight: '600' },
  perHour: { fontSize: 13 },
  rateBox: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 13, borderWidth: 1.5 },
  rateInput: { width: 40, fontWeight: '700', fontSize: 19, textAlign: 'center', padding: 0 },
  infoCard: { marginTop: 14, padding: 14, borderWidth: 1 },
  payoutLine: { marginTop: 16, fontSize: 15 },
});
