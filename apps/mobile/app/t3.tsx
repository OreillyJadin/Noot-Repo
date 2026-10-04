// T3 Courses You Tutor — Step 3 of the tutor application. → T4 Set your rates.
// Loads the tutor's real courses (api.tutors.getById self), lets them add/remove, and
// persists via api.profile.setTutorCourses on continue. Rates are set on T4 — or, when
// opened from Courses & rates (?from=rates), back on that screen.
//
// Adding is one tap per course (ERR-004): the search stays open, each pick goes straight
// onto the list, and its grade is chosen on its own card. It used to be search → pick →
// grade → "+ Add" → search again for every single course.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Badge, Eyebrow, H2, ProgressDots, H1, Sub, Ic, Skeleton, useTheme } from '@noot/ui';
import { api, type CatalogCourse } from '@noot/core';
import { CoursePicker } from '../lib/CoursePicker';
import { useStepBack } from '../lib/useStepBack';

const GRADE_OPTIONS = ['A', 'A-', 'B+', 'B'];
const MAX_COURSES = 10;

/** A course the tutor teaches. hourlyRate/sessions are preserved across saves (rates are
 *  set on T4); grade + code are what this screen edits. */
type CourseRow = { courseCode: string; grade: string; hourlyRate: number; sessions: number; title?: string };

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
  const stepBack = useStepBack(3);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Opened from Courses & rates ("Add a course") or the step-9 review rather than walking
  // through onboarding: saving returns there instead of going on to step 4 (T1, T5).
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromRates = from === 'rates' || from === 'review';

  // Load the tutor's existing courses (own rows — works before approval).
  useEffect(() => {
    let active = true;
    api.profile
      .getMyTutorProfile()
      .then((tutor) => {
        if (active) {
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

  // The code can only come from the catalog — no accepting whatever was typed, which is what
  // let a tutor store "MATH125" and never match a student's "MATH 125". The grade is picked
  // on the course's card afterwards, so the search never has to be reopened.
  const addCourse = (picked: CatalogCourse) => {
    if (courses.length >= MAX_COURSES) return Alert.alert('Limit reached', `You can add up to ${MAX_COURSES} courses.`);
    // Checked again inside the update: two quick taps can both run before a re-render.
    setCourses((cs) =>
      cs.length >= MAX_COURSES || cs.some((c) => c.courseCode === picked.courseCode)
        ? cs
        : [...cs, { courseCode: picked.courseCode, grade: '', hourlyRate: 0, sessions: 0, title: picked.courseTitle }],
    );
  };

  const setGrade = (code: string, grade: string) =>
    setCourses((cs) => cs.map((c) => (c.courseCode === code ? { ...c, grade } : c)));

  const removeCourse = (code: string) =>
    Alert.alert('Remove course', `Remove ${code} from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setCourses((cs) => cs.filter((c) => c.courseCode !== code)) },
    ]);

  // Only courses with a grade are ever saved: nothing after this step asks for one again, so
  // an ungraded course would otherwise ride through to a submitted (or live) profile.
  const persist = async (): Promise<boolean> => {
    try {
      await api.profile.setTutorCourses(courses.filter((c) => c.grade));
      return true;
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
      return false;
    }
  };

  const saveAndContinue = async () => {
    if (saving) return;
    if (courses.length === 0) return Alert.alert('Add a course', 'Add at least one course you can tutor.');
    const ungraded = courses.filter((c) => !c.grade);
    if (ungraded.length > 0) {
      return Alert.alert('Pick your grades', `Select the grade you earned in ${ungraded.map((c) => c.courseCode).join(', ')}.`);
    }
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (!ok) return;
    if (fromRates) router.back();
    else router.push('/t4');
  };

  const saveAndExit = async () => {
    // Still loading (or the load failed): the list on screen isn't the saved one, and saving
    // it would wipe their courses.
    if (loading) return router.replace('/');
    const ungraded = courses.filter((c) => !c.grade);
    if (ungraded.length === 0) {
      await persist();
      return router.replace('/');
    }
    Alert.alert(
      'Pick your grades',
      `${ungraded.map((c) => c.courseCode).join(', ')} ${ungraded.length === 1 ? 'has' : 'have'} no grade yet and won’t be saved.`,
      [
        { text: 'Pick grades', style: 'cancel' },
        { text: 'Exit anyway', onPress: async () => { await persist(); router.replace('/'); } },
      ],
    );
  };

  return (
    <Screen>
      <StepHead
        step={3}
        title="Courses you tutor"
        sub="Add up to 10. Add the ones you crushed."
        onBack={stepBack}
        onExit={saveAndExit}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Card flat style={[styles.addingCard, { borderColor: t.borderStrong, backgroundColor: t.surfaceAlt }]}>
          <Eyebrow style={{ marginBottom: 10 }}>Add courses</Eyebrow>
          <CoursePicker
            label=""
            keepOpen
            selected={courses.map((c) => c.courseCode)}
            onSelect={addCourse}
            placeholder="Search e.g. MATH or calculus"
          />
          <Text style={[styles.addHint, { color: t.text3 }]}>
            Tap every course you want — the list stays open. Then pick your grade for each one below.
          </Text>
        </Card>

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
          <Text style={{ fontSize: 13, color: t.text3 }}>No courses yet — search above and tap the ones you aced.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {courses.map((c) => (
              <Card key={c.courseCode} style={styles.courseCard}>
                <View style={styles.courseHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.courseCode, { color: t.text }]}>{c.courseCode}</Text>
                    {c.title ? (
                      <Text numberOfLines={1} style={[styles.courseSem, { color: t.text3 }]}>{c.title}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => removeCourse(c.courseCode)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${c.courseCode}`}
                  >
                    <Ic name="x" size={18} color={t.text3} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.gradeRow}>
                  <Text style={[styles.gradeLabel, { color: c.grade ? t.text3 : t.accent }]}>
                    {c.grade ? 'Your grade' : 'Pick your grade'}
                  </Text>
                  {GRADE_OPTIONS.map((g) => {
                    const on = c.grade === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setGrade(c.courseCode, g)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`Grade ${g} in ${c.courseCode}`}
                        style={[
                          styles.gradeChip,
                          { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.borderStrong },
                        ]}
                      >
                        <Text style={[styles.gradeChipText, { color: on ? t.onAccent : t.text2 }]}>{g}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>
        )}

        <Text style={[styles.anytime, { color: t.text3 }]}>
          You can add or remove courses at any time from your tutor profile.
        </Text>
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
  courseCard: { gap: 10, padding: 12 },
  courseHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gradeLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  gradeChip: { minWidth: 40, height: 34, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  gradeChipText: { fontWeight: '700', fontSize: 14 },
  courseCode: { fontSize: 16, fontWeight: '600' },
  courseSem: { fontSize: 13 },
  addingCard: { marginBottom: 18, padding: 16, borderWidth: 1.5, borderStyle: 'dashed' },
  addHint: { fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  anytime: { fontSize: 13, lineHeight: 19, marginTop: 14, textAlign: 'center' },
});
