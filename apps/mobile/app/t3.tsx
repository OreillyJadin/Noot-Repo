// T3 Courses You Tutor — ported from screens-tutor.jsx (T3). Step 3 of the tutor
// application. → T4 Set your rates. "Save & exit" → Landing. Add/Edit course
// actions are backend-only in the prototype (showToast) — no-op here for now.
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Field, Select, Badge, Eyebrow, H2, Muted, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';

const EXISTING: [string, string, string][] = [
  ['CH 101', 'A', 'Fall 2024'],
  ['CH 102', 'A-', 'Spring 2025'],
];
const GRADE_OPTIONS = ['A', 'A-', 'B+', 'B'];
const SEMESTER_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let y = 2025; y >= 2023; y--) {
    for (const term of ['Fall', 'Summer', 'Spring']) out.push(`${term} ${y}`);
  }
  return out;
})();

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

export default function T3() {
  const t = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [semester, setSemester] = useState('');

  return (
    <Screen>
      <StepHead
        step={3}
        title="Courses you tutor"
        sub="Add up to 10. Add the ones you crushed."
        onBack={() => router.back()}
        onExit={() => router.replace('/')}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <View style={styles.headRow}>
          <H2 style={{ fontSize: 16 }}>Your courses</H2>
          <Badge label="2 / 10" tone="neutral" />
        </View>

        <View style={{ gap: 10 }}>
          {EXISTING.map(([course, g, sem]) => (
            <Card
              key={course}
              onPress={() => Alert.alert('Edit ' + course, 'Built with backend') /* TODO(api) */}
              style={styles.courseCard}
            >
              <View style={[styles.gradeChip, { backgroundColor: t.accent }]}>
                <Text style={[styles.gradeChipText, { color: t.onAccent }]}>{g}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.courseCode, { color: t.text }]}>{course}</Text>
                <Text style={[styles.courseSem, { color: t.text3 }]}>{sem}</Text>
              </View>
              <Ic name="edit" size={18} color={t.text3} strokeWidth={1.7} />
            </Card>
          ))}
        </View>

        <Card flat style={[styles.addingCard, { borderColor: t.borderStrong, backgroundColor: t.surfaceAlt }]}>
          <Eyebrow style={{ marginBottom: 10 }}>Adding</Eyebrow>
          <Field
            placeholder="Search UA course catalog…"
            value={search}
            onChangeText={setSearch}
            suffix={<Ic name="search" size={18} color={t.text3} strokeWidth={1.8} />}
          />
          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Select placeholder="Grade" value={grade} options={GRADE_OPTIONS} onChange={setGrade} />
            </View>
            <View style={{ flex: 1 }}>
              <Select placeholder="Semester" value={semester} options={SEMESTER_OPTIONS} onChange={setSemester} />
            </View>
          </View>
          <Text style={[styles.professorHint, { color: t.text3 }]}>
            Professor <Muted>(optional, v1)</Muted>
          </Text>
        </Card>
      </Body>
      <ActionBar>
        <Button
          label="+ Add"
          kind="secondary"
          size="md"
          style={{ flex: 1 }}
          onPress={() => Alert.alert('Add a course you aced', 'Built with backend') /* TODO(api) */}
        />
        <Button label="Save & Continue" kind="primary" style={{ flex: 1.6 }} onPress={() => router.push('/t4')} />
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
  courseCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  gradeChip: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gradeChipText: { fontWeight: '700', fontSize: 15 },
  courseCode: { fontSize: 16, fontWeight: '600' },
  courseSem: { fontSize: 13 },
  addingCard: { marginTop: 12, padding: 16, borderWidth: 1.5, borderStyle: 'dashed' },
  row: { flexDirection: 'row', gap: 10 },
  professorHint: { fontSize: 13, marginTop: 10 },
});
