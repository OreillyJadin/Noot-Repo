// S1 Student Profile Setup — ported from screens-student.jsx (StudentProfile).
// Step 3 of 3 in onboarding. "Complete profile" → Student Home.
// Prefills from useMe(); persists name/year/major/courses via @noot/core.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { api, ACADEMIC_YEAR_OPTIONS, academicYearLabel } from '@noot/core';
import { GraduationYearField } from '../lib/GraduationYearField';
import { useApp } from '../lib/store';
import { useMe } from '../lib/useMe';
import { routeAfterAuth } from '../lib/postAuth';
import { validatePersonal } from '../lib/profileValidation';
import { MajorPicker } from '../lib/MajorPicker';
import { CoursePicker } from '../lib/CoursePicker';
import {
  Screen,
  NavTop,
  Body,
  ActionBar,
  Button,
  Field,
  Select,
  Divider,
  Eyebrow,
  Label,
  ProgressDots,
  Ic,
  useTheme,
} from '@noot/ui';


// ── local helpers (used only by this screen) ───────────────────────────────
function CourseChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label}`}
      style={[styles.chip, { backgroundColor: t.accentWeak }]}
    >
      <Text style={[styles.chipLabel, { color: t.accent }]}>{label}</Text>
      <Ic name="x" size={13} color={t.accent} strokeWidth={2.2} />
    </Pressable>
  );
}

function AddCourseChip({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, styles.chipOutline, { backgroundColor: t.surface, borderColor: t.borderStrong }]}
    >
      <Ic name="plus" size={14} color={t.text2} strokeWidth={2.2} />
      <Text style={[styles.chipLabel, { color: t.text2 }]}>Add course</Text>
    </Pressable>
  );
}

export default function StudentProfile() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const { me, refresh } = useMe();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [year, setYear] = useState('');
  const [expectedYear, setExpectedYear] = useState('');
  const [major, setMajor] = useState('');
  const [courses, setCourses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Prefill the editable fields once the signed-in user loads (returning user
  // sees their own data). Falls back to empty strings before load / no session.
  // Once only: useMe re-reads in the background (S1), and re-filling on each re-read
  // would overwrite what the user is typing.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!me || prefilled) return;
    setPrefilled(true);
    setFirstName(me.firstName);
    setLastName(me.lastName);
    setYear(academicYearLabel(me.year));
    setExpectedYear(me.expectedGraduationYear?.toString() ?? '');
    setMajor(me.major ?? '');
    setCourses(me.courses);
  }, [me, prefilled]);

  // "Add course" opens the catalog search inline; picking one adds it and closes it.
  const [adding, setAdding] = useState(false);
  const addCourse = (code: string) => {
    setCourses((cs) => (cs.includes(code) ? cs : [...cs, code]));
    setAdding(false);
  };
  const removeCourse = (code: string) => setCourses((cs) => cs.filter((c) => c !== code));

  const complete = async () => {
    const validationError = validatePersonal({ firstName, lastName, year, major, expectedGraduationYear: expectedYear }, { requireYearMajor: true });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await api.profile.updatePersonal({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        year: year.trim() || null,
        expectedGraduationYear: year === 'Post Grad' || !expectedYear ? null : Number(expectedYear),
        major: major.trim() || null,
      });
      await api.profile.setCourses(courses);
      // Both writes already triggered a re-read; wait for it so Home and Profile open on
      // the data just entered, not the empty row from sign-up.
      await refresh();
      if (!(await routeAfterAuth(router, setRole)).ok) {
        Alert.alert('Could not save', 'Please sign in and try again.');
      }
    } catch {
      Alert.alert('Could not save', 'Please sign in and try again.');
    }
  };

  return (
    <Screen>
      <NavTop
        onBack={() => router.back()}
        title="Your profile"
        trailing={<Text style={[styles.stepLabel, { color: t.text3 }]}>3 of 3</Text>}
      />
      <Body pad={20}>
        <ProgressDots total={3} current={3} style={{ marginBottom: 22 }} />

        <Eyebrow style={{ color: t.text3 }}>Required</Eyebrow>
        <View style={styles.nameRow}>
          <View style={styles.flex1}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={styles.flex1}>
            <Field label="Last name" value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        <View style={styles.mt14}>
          <Select label="Academic status" value={year} options={ACADEMIC_YEAR_OPTIONS} onChange={setYear} />
          <GraduationYearField year={year} value={expectedYear} onChange={setExpectedYear} />
        </View>

        <View style={styles.mt14}>
          <MajorPicker value={major} onChange={setMajor} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Divider style={styles.divider} />

        <Eyebrow style={{ color: t.text3 }}>Optional</Eyebrow>
        <Label style={{ marginTop: 10 }}>Current courses</Label>
        <View style={styles.chipWrap}>
          {courses.map((c) => (
            <CourseChip key={c} label={c} onRemove={() => removeCourse(c)} />
          ))}
          {!adding ? <AddCourseChip onPress={() => setAdding(true)} /> : null}
        </View>
        {adding ? (
          <View style={styles.mt14}>
            <CoursePicker label="" selected={courses} onSelect={(c) => addCourse(c.courseCode)} />
            <Text onPress={() => setAdding(false)} style={[styles.cancel, { color: t.text3 }]}>Cancel</Text>
          </View>
        ) : null}
        <Text style={[styles.helpText, { color: t.text3 }]}>
          Helps us match tutors who took your exact classes — same professor when we can.
        </Text>
      </Body>
      <ActionBar>
        <Button label="Complete profile" kind="primary" full iconRight="chevron" onPress={complete} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 13, fontWeight: '600' },
  nameRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  flex1: { flex: 1 },
  mt14: { marginTop: 14 },
  divider: { marginTop: 22, marginBottom: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999 },
  chipOutline: { borderWidth: 1 },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  cancel: { fontSize: 13, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  helpText: { fontSize: 13, marginTop: 10, lineHeight: 18 },
  error: { color: '#C0392B', fontSize: 14, marginTop: 10 },
});
