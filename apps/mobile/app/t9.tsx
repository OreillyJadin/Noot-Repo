// T9 Review Profile — ported from screens-tutor.jsx (T9). Preview of the tutor
// card before submission. Step 9 of the tutor application. → T10 In review.
// Shows what's actually saved — photo, name, courses + rates, bio, hours (tracker T1);
// it used to be a hard-coded CH 101 / $25 mock. Final tweaks happen right here (T5) —
// "Edit" used to send the tutor all the way back to step 2.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Badge, Avatar, H2, ProgressDots, H1, Sub, Ic, Skeleton, Field, Select, Label, Eyebrow, useTheme } from '@noot/ui';
import {
  api,
  STEP_REQUIREMENTS,
  REQUIREMENT_LABEL,
  MIN_HOURLY_RATE,
  MAX_HOURLY_RATE,
  type MyTutorProfile,
  type Requirement,
  type TutorAvailability,
} from '@noot/core';
import { useTutorApplication } from '../lib/useTutorApplication';
import { errText } from '../lib/errText';
import { useMe } from '../lib/useMe';
import { MajorPicker } from '../lib/MajorPicker';
import { pickAndUploadAvatar } from '../lib/avatar';
import { useStepBack } from '../lib/useStepBack';

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

const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate Student'];

/**
 * Final tweaks without leaving the review (tracker T5): name, year, major, bio, photo and
 * per-course rates edit in place; adding a course or changing hours opens that step and
 * comes straight back here (?from=review) instead of walking the whole flow again.
 */
function ReviewEditor({ app, onSaved }: { app: MyTutorProfile; onSaved: () => Promise<void> }) {
  const t = useTheme();
  const router = useRouter();
  const { me } = useMe();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [year, setYear] = useState('');
  const [major, setMajor] = useState('');
  const [bio, setBio] = useState('');
  const [rates, setRates] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fill once; afterwards the fields are the tutor's edits in progress.
  useEffect(() => {
    if (prefilled || !me) return;
    setFirst(me.firstName);
    setLast(me.lastName);
    setYear(me.year ?? '');
    setMajor(me.major ?? '');
    setBio(app.bio);
    setPrefilled(true);
  }, [me, app, prefilled]);
  // Rates follow the saved course list (a course added on step 3 appears here with no rate).
  useEffect(() => {
    setRates((prev) => {
      const next: Record<string, string> = {};
      for (const c of app.courses) next[c.courseCode] = prev[c.courseCode] ?? (c.hourlyRate > 0 ? String(c.hourlyRate) : '');
      return next;
    });
  }, [app.courses]);

  const profileDirty =
    prefilled &&
    !!me &&
    (first.trim() !== me.firstName ||
      last.trim() !== me.lastName ||
      year !== (me.year ?? '') ||
      major !== (me.major ?? '') ||
      bio.trim() !== app.bio);
  const ratesDirty = app.courses.some((c) => (rates[c.courseCode] ?? '') !== (c.hourlyRate > 0 ? String(c.hourlyRate) : ''));
  const dirty = profileDirty || ratesDirty;

  const save = async () => {
    if (saving || !dirty) return;
    if (!first.trim() || !last.trim()) return Alert.alert('Add your name', 'Students see your first name and last initial.');
    const bad = app.courses.filter((c) => {
      const n = Number(rates[c.courseCode]);
      return !n || n < MIN_HOURLY_RATE || n > MAX_HOURLY_RATE;
    });
    if (bad.length) {
      return Alert.alert(
        'Check your rates',
        `Rates are $${MIN_HOURLY_RATE}–$${MAX_HOURLY_RATE}/hr. Check ${bad.map((c) => c.courseCode).join(', ')}.`,
      );
    }
    setSaving(true);
    try {
      if (profileDirty) {
        await api.profile.updatePersonal({ firstName: first.trim(), lastName: last.trim(), year: year || null, major: major || null });
        await api.profile.updateTutorProfile({ bio: bio.trim() });
      }
      if (ratesDirty) {
        await api.profile.setTutorCourses(
          app.courses.map((c) => ({ courseCode: c.courseCode, grade: c.grade, hourlyRate: Number(rates[c.courseCode]) })),
        );
      }
      await onSaved();
    } catch (e) {
      Alert.alert('Could not save', errText(e, 'Please check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const removeCourse = (code: string) =>
    Alert.alert('Remove course', `Remove ${code} from your profile?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.profile.setTutorCourses(
              app.courses
                .filter((c) => c.courseCode !== code)
                .map((c) => ({ courseCode: c.courseCode, grade: c.grade, hourlyRate: c.hourlyRate })),
            );
            await onSaved();
          } catch (e) {
            Alert.alert('Could not remove', errText(e, 'Please try again.'));
          }
        },
      },
    ]);

  return (
    <View style={{ gap: 14, marginTop: 4 }}>
      <Eyebrow style={{ color: t.text3 }}>Make final tweaks</Eyebrow>

      <View style={styles.photoRow}>
        <Avatar size={48} uri={me?.avatarUrl} />
        <Text onPress={() => void pickAndUploadAvatar()} style={[styles.link, { color: t.accent }]}>Change photo</Text>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="First" value={first} onChangeText={setFirst} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last" value={last} onChangeText={setLast} />
        </View>
      </View>
      <Select label="Year" value={year} options={YEAR_OPTIONS} onChange={setYear} />
      <MajorPicker value={major} onChange={setMajor} />
      <Field label="Bio" value={bio} onChangeText={setBio} multiline placeholder="Tell students why you're a great tutor…" />

      <Label>Courses &amp; rates</Label>
      {app.courses.map((c) => (
        <View key={c.courseCode} style={[styles.rateRow, { borderColor: t.border }]}>
          <Text style={[styles.rateCode, { color: t.text }]}>
            {c.courseCode}
            {c.grade ? <Text style={{ color: t.text3, fontWeight: '500' }}>{`  ${c.grade}`}</Text> : null}
          </Text>
          <View style={[styles.rateBox, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
            <Text style={{ color: t.text3 }}>$</Text>
            <TextInput
              value={rates[c.courseCode] ?? ''}
              onChangeText={(v) => setRates((r) => ({ ...r, [c.courseCode]: v.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="—"
              placeholderTextColor={t.text3}
              accessibilityLabel={`Hourly rate for ${c.courseCode}`}
              style={[styles.rateInput, { color: t.text }]}
            />
            <Text style={{ color: t.text3, fontSize: 12 }}>/hr</Text>
          </View>
          <Pressable onPress={() => removeCourse(c.courseCode)} hitSlop={8} accessibilityLabel={`Remove ${c.courseCode}`}>
            <Ic name="x" size={17} color={t.text3} strokeWidth={2} />
          </Pressable>
        </View>
      ))}
      <Text onPress={() => router.push('/t3?from=review')} style={[styles.link, { color: t.accent }]}>+ Add a course</Text>

      <View style={styles.hoursRow}>
        <Text style={[styles.hoursText, { color: t.text2 }]}>Weekly availability: {weeklyHours(app.availability)} hrs</Text>
        <Text onPress={() => router.push('/t5?from=review')} style={[styles.link, { color: t.accent }]}>Edit hours</Text>
      </View>

      {dirty ? (
        <Button label={saving ? 'Saving…' : 'Save changes'} kind="secondary" full disabled={saving} onPress={save} />
      ) : null}
    </View>
  );
}

/** The onboarding step that owns a requirement. */
function stepFor(r: Requirement): number {
  const hit = Object.entries(STEP_REQUIREMENTS).find(([, reqs]) => reqs.includes(r));
  return hit ? Number(hit[0]) : 2;
}

/** Hours per week across the saved windows ("14:00"–"17:00" → 3). */
function weeklyHours(windows: TutorAvailability[]): number {
  const h = (hm: string) => {
    const [hh, mm] = hm.split(':').map(Number);
    return (hh ?? 0) + (mm ?? 0) / 60;
  };
  return Math.round(windows.reduce((sum, w) => sum + Math.max(0, h(w.endTime) - h(w.startTime)), 0));
}

export default function T9() {
  const t = useTheme();
  const router = useRouter();
  const stepBack = useStepBack(9);
  const { me, tutorStatus } = useMe();
  // The saved application, re-read on focus so an edit made on an earlier step shows here
  // when the tutor comes back (T1), plus what's still missing (T4). Name/major/photo come
  // from useMe, which already follows every save.
  const { app, missing, reload } = useTutorApplication();
  const ready = missing !== null && missing.length === 0;
  const alreadySubmitted = tutorStatus === 'pending' || tutorStatus === 'approved';
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!ready || submitting || alreadySubmitted) return;
    setSubmitting(true);
    try {
      // The server re-checks every requirement (0038) — this button can't be the only gate.
      await api.profile.submitTutorApplication();
      router.replace('/t10');
    } catch (e) {
      Alert.alert('Could not submit', errText(e, 'Please check your connection and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const previewName = me ? `${me.firstName} ${me.lastName ? me.lastName.charAt(0) + '.' : ''}`.trim() : '';
  const previewMeta = [me?.year, me?.major].filter(Boolean).join(' · ');
  const courses = app?.courses ?? [];
  const priced = courses.filter((c) => c.hourlyRate > 0);
  const fromRate = priced.length ? Math.min(...priced.map((c) => c.hourlyRate)) : null;
  const hours = app ? weeklyHours(app.availability) : 0;

  return (
    <Screen>
      <StepHead step={9} title="How your profile looks" onBack={stepBack} onExit={() => router.replace('/')} />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        {!app ? (
          <Skeleton height={220} radius={16} />
        ) : (
          <Card style={styles.previewCard}>
            <View style={styles.badgeRow}>
              <Badge label="Pending review" tone="accentSoft" />
            </View>
            <View style={styles.previewHead}>
              <Avatar size={56} uri={me?.avatarUrl} />
              <View style={{ flex: 1 }}>
                <H2 style={{ fontSize: 18 }}>{previewName || 'Add your name'}</H2>
                {previewMeta ? <Text style={[styles.previewSub, { color: t.text3 }]}>{previewMeta}</Text> : null}
                <View style={styles.courseBadges}>
                  {courses.map((c) => (
                    <Badge key={c.courseCode} label={c.courseCode} tone="accentSoft" />
                  ))}
                </View>
              </View>
              {fromRate != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.price, { color: t.text }]}>${fromRate}</Text>
                  <Text style={[styles.priceUnit, { color: t.text3 }]}>/hr</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.previewFoot}>
              <Text style={[styles.bio, { color: app.bio ? t.text2 : t.text3 }]}>
                {app.bio || 'No bio yet — add one so students know why to pick you.'}
              </Text>
              <View style={{ gap: 6, marginTop: 14 }}>
                {courses.map((c) => (
                  <View key={c.courseCode} style={[styles.statBox, { backgroundColor: t.surface2 }]}>
                    <Ic name="dollar" size={16} color={t.accent} strokeWidth={1.8} />
                    <Text style={[styles.statLabel, { color: t.text2 }]}>
                      {c.courseCode}{c.grade ? ` · ${c.grade}` : ''}
                    </Text>
                    <Text style={[styles.statValue, { color: c.hourlyRate > 0 ? t.text : t.text3 }]}>
                      {c.hourlyRate > 0 ? `$${c.hourlyRate}/hr` : 'No rate'}
                    </Text>
                  </View>
                ))}
                <View style={[styles.statBox, { backgroundColor: t.surface2 }]}>
                  <Ic name="clock" size={16} color={t.accent} strokeWidth={1.8} />
                  <Text style={[styles.statLabel, { color: t.text2 }]}>Weekly availability</Text>
                  <Text style={[styles.statValue, { color: t.text }]}>{hours} hrs</Text>
                </View>
              </View>
            </View>
          </Card>
        )}

        {missing && missing.length > 0 ? (
          <Card flat style={[styles.todoCard, { backgroundColor: t.surfaceAlt }]}>
            <Text style={[styles.todoTitle, { color: t.text }]}>Still to do before you can submit</Text>
            {missing.map((r) => (
              <Pressable
                key={r}
                onPress={() => router.push(`/t${stepFor(r)}` as never)}
                accessibilityRole="button"
                style={styles.todoRow}
              >
                <Ic name="alert" size={15} color={t.text3} strokeWidth={2} />
                <Text style={[styles.todoText, { color: t.text2 }]}>{REQUIREMENT_LABEL[r]}</Text>
                <Text style={[styles.todoGo, { color: t.accent }]}>Step {stepFor(r)}</Text>
              </Pressable>
            ))}
          </Card>
        ) : null}

        {app ? <ReviewEditor app={app} onSaved={reload} /> : null}
      </Body>
      <ActionBar>
        <Button
          label={alreadySubmitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit for review'}
          kind="primary"
          full
          disabled={!ready || submitting || alreadySubmitted}
          onPress={submit}
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
  previewCard: { padding: 0, overflow: 'hidden' },
  badgeRow: { paddingHorizontal: 16, paddingTop: 12, alignItems: 'flex-end' },
  previewHead: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  previewSub: { fontSize: 13, marginTop: 2 },
  courseBadges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  price: { fontSize: 20, fontWeight: '700' },
  priceUnit: { fontSize: 12 },
  previewFoot: { paddingHorizontal: 16, paddingBottom: 16 },
  bio: { fontSize: 14, lineHeight: 20 },
  statBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  statLabel: { fontSize: 13, flexShrink: 1 },
  statValue: { fontSize: 13, fontWeight: '700', marginLeft: 'auto' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  link: { fontSize: 14, fontWeight: '600' },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  rateCode: { flex: 1, fontSize: 15, fontWeight: '600' },
  rateBox: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 11, borderWidth: 1.5 },
  rateInput: { width: 36, fontWeight: '700', fontSize: 17, textAlign: 'center', padding: 0 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hoursText: { fontSize: 14 },
  todoCard: { padding: 14, gap: 8 },
  todoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  todoText: { flex: 1, fontSize: 13.5 },
  todoGo: { fontSize: 13, fontWeight: '600' },
});
