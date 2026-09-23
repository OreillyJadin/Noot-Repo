// T5 Set Availability — ported from screens-tutor.jsx (T5). Paintable weekly grid +
// common locations. Step 5 of the tutor application. → T6 Verify grades.
// "Save & exit" → Landing.
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
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Eyebrow, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';

import { DAY_LABELS, ROW_LABELS, BLOCK_HOURS, EMPTY_GRID, windowsFromGrid, gridFromWindows } from '../lib/weekGrid';

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
  const [grid, setGrid] = useState<number[][]>(EMPTY_GRID);
  const [saving, setSaving] = useState(false);
  // Hours already saved (coming back to this step, or editing from step 9) are painted in.
  // Only a grid the tutor actually touched is written back: the grid is coarser than Edit
  // Availability, so re-saving an untouched grid could round away hours set there.
  const [hadSaved, setHadSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    api.profile
      .getMyTutorProfile()
      .then((p) => {
        if (!active || p.availability.length === 0) return;
        setGrid(gridFromWindows(p.availability));
        setHadSaved(true);
      })
      .catch(() => { /* nothing saved yet → empty grid */ });
    return () => { active = false; };
  }, []);

  const toggle = (r: number, c: number) => {
    setDirty(true);
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? (v ? 0 : 1) : v)) : row)));
  };
  const total = grid.flat().reduce((a, b) => a + b, 0) * BLOCK_HOURS;

  const saveAndContinue = async () => {
    if (saving) return;
    if (hadSaved && !dirty) {
      router.push('/t6');
      return;
    }
    const windows = windowsFromGrid(grid);
    if (windows.length === 0) {
      Alert.alert('Pick some hours', 'Tap the grid to mark when you can tutor.');
      return;
    }
    setSaving(true);
    try {
      await api.profile.updateAvailability(windows);
      router.push('/t6');
    } catch {
      Alert.alert('Could not save your availability', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <StepHead step={5} title="When can you tutor?" onBack={() => router.back()} onExit={() => router.replace('/')} />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <View style={styles.headRow}>
          <Eyebrow style={{ color: t.text3 }}>Weekly availability</Eyebrow>
          <Text style={[styles.totalHrs, { color: t.accent }]}>{total} hrs/wk ✓</Text>
        </View>

        <View style={{ gap: 5 }}>
          <View style={styles.gridRow}>
            <View style={styles.gridRowLabel} />
            {DAY_LABELS.map((d, i) => (
              <Text key={i} style={[styles.gridDay, { color: t.text3 }]}>
                {d}
              </Text>
            ))}
          </View>
          {grid.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              <Text style={[styles.gridRowLabelText, { color: t.text3 }]}>{ROW_LABELS[ri]}</Text>
              {row.map((cell, ci) => (
                <Pressable
                  key={ci}
                  onPress={() => toggle(ri, ci)}
                  style={[styles.gridCell, { backgroundColor: cell ? t.accent : t.surface2, borderColor: cell ? t.accent : t.border }]}
                />
              ))}
            </View>
          ))}
        </View>
        <Text style={[styles.gridHint, { color: t.text3 }]}>Tap cells to paint your availability.</Text>


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
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  totalHrs: { fontSize: 13, fontWeight: '700' },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gridRowLabel: { width: 24 },
  gridRowLabelText: { width: 24, fontSize: 11 },
  gridDay: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  gridCell: { flex: 1, height: 30, borderRadius: 7, borderWidth: 1 },
  gridHint: { fontSize: 12, marginTop: 8 },
});
