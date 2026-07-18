// T3 Courses You Tutor — Step 3 of the tutor application. → T4 Set your rates.
// Loads the tutor's real courses (api.tutors.getById self), lets them add/remove, and
// persists via api.profile.setTutorCourses on continue. Rates are set on T4.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Field, Select, Badge, Eyebrow, H2, Muted, ProgressDots, H1, Sub, Ic, Skeleton, useTheme } from '@noot/ui';
import { api } from '@noot/core';

const GRADE_OPTIONS = ['A', 'A-', 'B+', 'B'];
const MAX_COURSES = 10;

/** A course the tutor teaches. hourlyRate/sessions are preserved across saves (rates are
 *  set on T4); grade + code are what this screen edits. */
type CourseRow = { courseCode: string; grade: string; hourlyRate: number; sessions: number };

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
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');

  // Load the tutor's existing courses (own profile).
  useEffect(() => {
    let active = true;
    api
      .getMe()
      .then((me) => (me ? api.tutors.getById(me.id) : null))
      .then((tutor) => {
        if (active && tutor) {
          setCourses(
            tutor.courses.map((c) => ({
              courseCode: c.courseCode,
              grade: c.grade ?? '',
              hourlyRate: c.hourlyRate,
              sessions: c.sessions,
            })),
          );
        }
      })
      .catch(() => { /* no session / no courses yet → empty list */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const addCourse = () => {
    const code = search.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!code) return Alert.alert('Add a course', 'Enter the course code, e.g. MATH 125.');
    if (!grade) return Alert.alert('Pick your grade', 'Select the grade you earned in this course.');
    if (courses.length >= MAX_COURSES) return Alert.alert('Limit reached', `You can add up to ${MAX_COURSES} courses.`);
    if (courses.some((c) => c.courseCode === code)) return Alert.alert('Already added', `${code} is already in your list.`);
    setCourses((cs) => [...cs, { courseCode: code, grade, hourlyRate: 0, sessions: 0 }]);
    setSearch('');
    setGrade('');
  };

  const removeCourse = (code: string) =>
    Alert.alert('Remove course', `Remove ${code} from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setCourses((cs) => cs.filter((c) => c.courseCode !== code)) },
    ]);

  const persist = async (): Promise<boolean> => {
    try {
      await api.profile.setTutorCourses(courses);
      return true;
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
      return false;
    }
  };

  const saveAndContinue = async () => {
    if (saving) return;
    if (courses.length === 0) return Alert.alert('Add a course', 'Add at least one course you can tutor.');
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (ok) router.push('/t4');
  };

  const saveAndExit = async () => {
    await persist();
    router.replace('/');
  };

  return (
    <Screen>
      <StepHead
        step={3}
        title="Courses you tutor"
        sub="Add up to 10. Add the ones you crushed."
        onBack={() => router.back()}
        onExit={saveAndExit}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <View style={styles.headRow}>
          <H2 style={{ fontSize: 16 }}>Your courses</H2>
          <Badge label={`${courses.length} / ${MAX_COURSES}`} tone="neutral" />
        </View>

        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={62} radius={14} />
            <Skeleton height={62} radius={14} />
          </View>
        ) : courses.length === 0 ? (
          <Text style={{ fontSize: 13, color: t.text3 }}>No courses yet — add the ones you aced below.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {courses.map((c) => (
              <Card key={c.courseCode} onPress={() => removeCourse(c.courseCode)} style={styles.courseCard}>
                <View style={[styles.gradeChip, { backgroundColor: t.accent }]}>
                  <Text style={[styles.gradeChipText, { color: t.onAccent }]}>{c.grade || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.courseCode, { color: t.text }]}>{c.courseCode}</Text>
                  <Text style={[styles.courseSem, { color: t.text3 }]}>Grade {c.grade || '—'} · tap to remove</Text>
                </View>
                <Ic name="x" size={18} color={t.text3} strokeWidth={2} />
              </Card>
            ))}
          </View>
        )}

        <Card flat style={[styles.addingCard, { borderColor: t.borderStrong, backgroundColor: t.surfaceAlt }]}>
          <Eyebrow style={{ marginBottom: 10 }}>Adding</Eyebrow>
          <Field
            placeholder="Course code, e.g. MATH 125"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
            suffix={<Ic name="search" size={18} color={t.text3} strokeWidth={1.8} />}
          />
          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Select placeholder="Grade" value={grade} options={GRADE_OPTIONS} onChange={setGrade} />
            </View>
          </View>
          <Text style={[styles.professorHint, { color: t.text3 }]}>
            Professor <Muted>(optional, v1)</Muted>
          </Text>
        </Card>
      </Body>
      <ActionBar>
        <Button label="+ Add" kind="secondary" size="md" style={{ flex: 1 }} onPress={addCourse} />
        <Button
          label={saving ? 'Saving…' : 'Save & Continue'}
          kind="primary"
          style={{ flex: 1.6 }}
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
  courseCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  gradeChip: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gradeChipText: { fontWeight: '700', fontSize: 15 },
  courseCode: { fontSize: 16, fontWeight: '600' },
  courseSem: { fontSize: 13 },
  addingCard: { marginTop: 12, padding: 16, borderWidth: 1.5, borderStyle: 'dashed' },
  row: { flexDirection: 'row', gap: 10 },
  professorHint: { fontSize: 13, marginTop: 10 },
});
