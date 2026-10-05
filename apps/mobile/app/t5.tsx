// T5 Set Availability — Step 5 of the tutor application. → T6 Verify grades.
// "Save & exit" → Landing.
//
// Hour by hour, with the same picker as Edit Availability (ERR-013). It used to be a grid of
// five 3-hour blocks, so a tutor couldn't offer a single hour until after onboarding.
//
// The grid PERSISTS through api.profile.updateAvailability(). It used to be pure local
// state that "Save & Continue" silently discarded — a tutor filled it in, moved on, and
// their availability was never saved (APP_REVIEW_TICKETS.md T21). It starts empty for the
// same reason: the old pre-filled INIT_GRID invented hours the tutor never chose.
//
// The "Common locations" editor was removed with it. There is nowhere to store a
// per-tutor location — `tutoring_locations` (0027) is a read-only campus list maintained
// out of band, and B3's spot picker has its own list — so the field only ever discarded
// what the tutor typed.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Body, ActionBar, Button, Eyebrow, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';

import { AvailabilityEditor } from '../lib/AvailabilityEditor';
import { emptyGrid, totalHours, windowsFromGrid, gridFromWindows, type WeekGrid } from '../lib/weekGrid';
import { useStepBack } from '../lib/useStepBack';

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

export default function T5() {
  const t = useTheme();
  const router = useRouter();
  const stepBack = useStepBack(5);
  const [grid, setGrid] = useState<WeekGrid>(emptyGrid);
  const [saving, setSaving] = useState(false);
  // Hours already saved (coming back to this step, or editing from step 9) are painted in.
  // Only a grid the tutor actually touched is written back: the grid holds whole hours from
  // 8am to 10pm, so re-saving an untouched one could round away anything saved outside that.
  const [hadSaved, setHadSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Mirrors `dirty` for the load below, which must not replace hours tapped while it ran.
  const touched = useRef(false);
  useEffect(() => {
    let active = true;
    api.profile
      .getMyTutorProfile()
      .then((p) => {
        if (!active || touched.current || p.availability.length === 0) return;
        setGrid(gridFromWindows(p.availability));
        setHadSaved(true);
      })
      .catch(() => { /* nothing saved yet → empty grid */ });
    return () => { active = false; };
  }, []);

  // From the step-9 review (T5): go back there instead of on to step 6.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const next = () => (from === 'review' ? router.back() : router.push('/t6'));

  const edit = (next: WeekGrid) => {
    touched.current = true;
    setDirty(true);
    setGrid(next);
  };
  const total = totalHours(grid);

  const saveAndContinue = async () => {
    if (saving) return;
    if (hadSaved && !dirty) {
      next();
      return;
    }
    const windows = windowsFromGrid(grid);
    if (windows.length === 0) {
      Alert.alert('Pick some hours', 'Tap the hours you can tutor.');
      return;
    }
    setSaving(true);
    try {
      await api.profile.updateAvailability(windows);
      next();
    } catch {
      Alert.alert('Could not save your availability', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <StepHead step={5} title="When can you tutor?" onBack={stepBack} onExit={() => router.replace('/')} />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <View style={styles.headRow}>
          <Eyebrow style={{ color: t.text3 }}>Weekly availability</Eyebrow>
          <Text style={[styles.totalHrs, { color: t.accent }]}>{total} hrs/wk{total > 0 ? ' ✓' : ''}</Text>
        </View>
        <AvailabilityEditor value={grid} onChange={edit} />
      </Body>
      <ActionBar>
        <Button
          label={saving ? 'Saving…' : 'Save & Continue'}
          kind="primary"
          full
          disabled={saving}
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
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalHrs: { fontSize: 13, fontWeight: '700' },
});
