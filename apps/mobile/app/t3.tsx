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
import { api, UNVERIFIED_FEE_RATE, type CatalogCourse } from '@noot/core';
import { CoursePicker } from '../lib/CoursePicker';
import { useStepBack } from '../lib/useStepBack';
import { errText } from '../lib/errText';
import { useMe } from '../lib/useMe';

const GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];
const MAX_COURSES = 10;

/** A course the tutor teaches. hourlyRate/sessions are preserved across saves (rates are
 *  set on T4); grade + current status + code are what this screen edits. */
type CourseRow = {
  courseCode: string;
  grade: string;
  currentlyTaking: boolean;
  existing: boolean;
  hourlyRate: number;
  sessions: number;
  title?: string;
};

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
  const { gradesVerified, loading: meLoading } = useMe();
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
              currentlyTaking: c.currentlyTaking,
              existing: true,
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
  // let a tutor store "MATH125" and never match a student's "MATH 125".
  const addCourse = (picked: CatalogCourse) => {
    if (courses.length >= MAX_COURSES) return Alert.alert('Limit reached', `You can add up to ${MAX_COURSES} courses.`);
    // Checked again inside the update: two quick taps can both run before a re-render.
    setCourses((cs) =>
      cs.length >= MAX_COURSES || cs.some((c) => c.courseCode === picked.courseCode)
        ? cs
        : [
            ...cs,
            {
              courseCode: picked.courseCode,
              grade: '',
              currentlyTaking: gradesVerified,
              existing: false,
              hourlyRate: 0,
              sessions: 0,
              title: picked.courseTitle,
            },
          ],
    );
  };

  const setGrade = (code: string, grade: string) =>
    setCourses((cs) => cs.map((c) => (c.courseCode === code ? { ...c, grade, currentlyTaking: false } : c)));

  const setCurrentlyTaking = (code: string) =>
    setCourses((cs) => cs.map((c) => (c.courseCode === code ? { ...c, grade: '', currentlyTaking: true } : c)));

  const removeCourse = (code: string) =>
    Alert.alert('Remove course', `Remove ${code} from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setCourses((cs) => cs.filter((c) => c.courseCode !== code)) },
    ]);

  // Only courses with an answer are saved; a course currently being taken is a valid answer.
  const persist = async (): Promise<boolean> => {
    try {
      await api.profile.setTutorCourses(
        courses
          .filter((c) => c.grade || c.currentlyTaking)
          .map((c) => ({
            courseCode: c.courseCode,
            grade: c.grade || null,
            hourlyRate: c.hourlyRate,
            currentlyTaking: c.currentlyTaking,
          })),
      );
      return true;
    } catch (e) {
      // The server's reason, when it has one (e.g. grades locked once verified, 0048).
      Alert.alert('Could not save', errText(e, 'Please check your connection and try again.'));
      return false;
    }
  };

  const saveAndContinue = async () => {
    if (saving) return;
    if (courses.length === 0) return Alert.alert('Add a course', 'Add at least one course you can tutor.');
    const ungraded = courses.filter((c) => !(c.grade || c.currentlyTaking));
    if (ungraded.length > 0) {
      return Alert.alert(
        'Courses need an answer',
        `Pick your grade, or Taking it now, for ${ungraded.map((c) => c.courseCode).join(', ')}.`,
      );
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
    if (loading || meLoading) return router.replace('/');
    const ungraded = courses.filter((c) => !(c.grade || c.currentlyTaking));
    if (ungraded.length === 0) {
      await persist();
      return router.replace('/');
    }
    Alert.alert(
      'Courses need an answer',
      `Pick your grade, or Taking it now, for ${ungraded.map((c) => c.courseCode).join(', ')}.`,
      [
        { text: 'Pick a grade or Taking it now', style: 'cancel' },
        { text: 'Exit anyway', onPress: async () => { await persist(); router.replace('/'); } },
      ],
    );
  };

  return (
    <Screen>
      <StepHead
        step={3}
        title="Courses you tutor"
        sub="Add up to 10. Pick grades you earned, or mark courses you're taking now."
        onBack={stepBack}
        onExit={saveAndExit}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Card flat style={[styles.addingCard, { borderColor: t.borderStrong, backgroundColor: t.surfaceAlt }]}>
          <Eyebrow style={{ marginBottom: 10 }}>Add courses</Eyebrow>
          {meLoading ? (
            <Skeleton height={48} radius={13} />
          ) : (
            <CoursePicker
              label=""
              keepOpen
              selected={courses.map((c) => c.courseCode)}
              onSelect={addCourse}
              placeholder="Search e.g. MATH or calculus"
            />
          )}
          <Text style={[styles.addHint, { color: t.text3 }]}>
            {gradesVerified
              ? "Your grades are verified, so you can only add courses you're taking now."
              : 'Tap every course you want — the list stays open. Then pick a grade or choose Taking it now for each one below.'}
          </Text>
        </Card>

        <View style={styles.headRow}>
          <H2 style={{ fontSize: 16 }}>Your courses</H2>
          <Badge label={`${courses.length} / ${MAX_COURSES}`} tone="neutral" />
        </View>

        {loading || meLoading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={62} radius={14} />
            <Skeleton height={62} radius={14} />
          </View>
        ) : courses.length === 0 ? (
          <Text style={{ fontSize: 13, color: t.text3 }}>No courses yet — search above and tap the courses you tutor.</Text>
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
                  {!gradesVerified || !c.existing ? (
                    <Pressable
                      onPress={() => removeCourse(c.courseCode)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${c.courseCode}`}
                    >
                      <Ic name="x" size={18} color={t.text3} strokeWidth={2} />
                    </Pressable>
                  ) : null}
                </View>
                {gradesVerified && c.existing ? (
                  <Text style={[styles.gradeLabel, { color: t.text2 }]}>
                    {c.currentlyTaking ? 'Currently taking' : c.grade || 'No grade on file'}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.gradeLabel, { color: c.grade || c.currentlyTaking ? t.text3 : t.accent }]}>
                      {c.grade || c.currentlyTaking ? 'Your grade' : 'Pick your grade'}
                    </Text>
                    <View style={styles.gradeRow}>
                      {!gradesVerified
                        ? GRADE_OPTIONS.map((g) => {
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
                          })
                        : null}
                      {(!gradesVerified || !c.existing) ? (
                        <Pressable
                          onPress={() => setCurrentlyTaking(c.courseCode)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: c.currentlyTaking }}
                          accessibilityLabel={`Taking it now for ${c.courseCode}`}
                          style={[
                            styles.nowChip,
                            {
                              backgroundColor: c.currentlyTaking ? t.accent : t.surface,
                              borderColor: c.currentlyTaking ? t.accent : t.borderStrong,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[styles.gradeChipText, { color: c.currentlyTaking ? t.onAccent : t.text2, fontSize: 12 }]}
                          >
                            Taking it now
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                )}
                {c.currentlyTaking ? (
                  <Text style={[styles.currentlyTakingNote, { color: t.text3 }]}>
                    Students see this as Currently taking. Noot&apos;s fee on this course is {UNVERIFIED_FEE_RATE * 100}% until a transcript shows your final grade.
                  </Text>
                ) : null}
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
          disabled={saving || loading || meLoading}
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
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gradeLabel: { fontSize: 13, fontWeight: '600' },
  gradeChip: { flexGrow: 1, flexBasis: 42, minWidth: 38, height: 34, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  nowChip: { flexGrow: 1, flexBasis: 110, height: 34, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  gradeChipText: { fontWeight: '700', fontSize: 14 },
  currentlyTakingNote: { fontSize: 12, lineHeight: 17 },
  courseCode: { fontSize: 16, fontWeight: '600' },
  courseSem: { fontSize: 13 },
  addingCard: { marginBottom: 18, padding: 16, borderWidth: 1.5, borderStyle: 'dashed' },
  addHint: { fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  anytime: { fontSize: 13, lineHeight: 19, marginTop: 14, textAlign: 'center' },
});
