// P4 Courses & Rates (Edit) — ported from screens-edit.jsx (EditRates). Tutor-only
// settings editor for per-course hourly rates. "Add a course" jumps to the tutor
// application's Courses step (T3). Verified tutors can add a course they're taking now,
// but existing course statuses and grades stay locked. Wired to @noot/core: prefills the tutor's
// per-course rows (api.getMe → tutors.getById) and persists them on save via
// profile.setTutorCourses(...) — the contract method for per-course rate rows.
// (profile.updateRates(number) sets only a single base rate, which this
// per-course UI doesn't expose, so we persist each course row instead.)
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Alert, Linking, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, ListSection, ListRow, Ic, useLargeText, useTheme } from '@noot/ui';
import { api, MIN_HOURLY_RATE, MAX_HOURLY_RATE } from '@noot/core';
import { useMe } from '../lib/useMe';
import { SUPPORT_EMAIL } from '../lib/legal';
import { RateViewToggle, TutorRatePreview } from '../lib/TutorRatePreview';
import { RateSlider } from '../lib/RateSlider';

// The server's own sentence when it refuses a save (e.g. the verified lock, 0048) — without
// the SQLSTATE that errText appends, which means nothing to a tutor.
function saveError(e: unknown): string {
  const message = e && typeof e === 'object' ? (e as { message?: unknown }).message : null;
  return typeof message === 'string' && message ? message : 'Please check your connection and try again.';
}

interface Rate {
  code: string;
  grade: string;
  currentlyTaking: boolean;
  rate: number;
  sessions: number;
}

export default function EditRates() {
  const t = useTheme();
  const { gradesVerified } = useMe();
  const router = useRouter();
  const largeText = useLargeText();
  const [rates, setRates] = useState<Rate[]>([]);
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNet, setShowNet] = useState(true);

  // On focus, not just mount: "Add a course" goes to step 3 and comes back here, and the
  // new course has to show up with its rate still to set (tracker T1).
  useFocusEffect(useCallback(() => {
    let active = true;
    api.profile
      .getMyTutorProfile()
      .then((tutor) => {
        if (active) {
          setRates(
            tutor.courses.map((c) => ({
              code: c.courseCode,
              grade: c.grade ?? '',
              currentlyTaking: c.currentlyTaking,
              rate: c.hourlyRate,
              sessions: c.sessions,
            })),
          );
        }
      })
      .catch(() => {
        /* no session / no tutor profile → empty list */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []));

  const setRate = useCallback((code: string, rate: number) =>
    setRates((rs) => rs.map((r) => (r.code === code ? { ...r, rate } : r))), []);

  // Only offered to a verified tutor: everyone else adds and removes courses on step 3,
  // which a verified tutor can't use (it also sets grades). Takes effect on "Save changes".
  const remove = (code: string) => {
    if (rates.length <= 1) {
      Alert.alert('Keep one course', 'You need at least one course to stay bookable.');
      return;
    }
    Alert.alert('Remove course', `Remove ${code}? To add it back later you’ll need to contact noot support.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setRates((rs) => rs.filter((r) => r.code !== code)) },
    ]);
  };

  const save = async () => {
    if (saving) return;
    // A course just added from step 3 has no rate yet; saving it at $0 would make it unbookable.
    const unset = rates.filter((r) => r.rate < MIN_HOURLY_RATE);
    if (unset.length > 0) {
      Alert.alert('Set a rate first', `Use the slider to set a rate for ${unset.map((r) => r.code).join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      await api.profile.setTutorCourses(
        rates.map((r) => ({
          courseCode: r.code,
          grade: r.grade || null,
          hourlyRate: r.rate,
          currentlyTaking: r.currentlyTaking,
        })),
      );
      Alert.alert('Rates updated');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', saveError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Courses & rates" onBack={() => router.back()} />
      <Body>
        <Text style={[styles.intro, { color: t.text2 }]}>
          Set an hourly rate per course. Changes apply to new bookings only — upcoming sessions keep the rate the
          student paid.
        </Text>

        <RateViewToggle showNet={showNet} onChange={setShowNet} />
        <View style={{ gap: 12, marginBottom: 16 }}>
          {rates.map((r) => (
            <Card key={r.code} style={{ gap: 12 }}>
              <View style={[styles.row, largeText && styles.rowStacked]}>
                <View style={{ flex: largeText ? undefined : 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.gradeBadge, { backgroundColor: t.accentWeak }]}>
                    {r.currentlyTaking ? <Ic name="cap" size={20} color={t.accent} /> : <Text style={{ color: t.accent, fontWeight: '700' }}>{r.grade || '—'}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{r.code}</Text>
                    <Text style={{ fontSize: 12.5, color: t.text3 }}>
                      {r.currentlyTaking ? 'Currently taking' : r.grade ? `Grade ${r.grade}${gradesVerified ? ' · verified' : ''}` : 'No grade'}
                    </Text>
                  </View>
                </View>
                <View style={styles.controls}>
                  <View style={[styles.ratePill, { backgroundColor: t.accentWeak }]}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>${r.rate.toFixed(2)}/hr</Text>
                  </View>
                  {gradesVerified ? (
                    <Pressable onPress={() => remove(r.code)} disabled={saving} hitSlop={10}
                      accessibilityRole="button" accessibilityLabel={`Remove ${r.code}`}>
                      <Ic name="x" size={18} color={t.text3} strokeWidth={2} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <RateSlider id={r.code} value={r.rate} min={MIN_HOURLY_RATE} max={MAX_HOURLY_RATE} label={`${r.code} hourly rate`}
                disabled={saving} onChange={setRate} />
              <TutorRatePreview rate={r.rate} gradesVerified={gradesVerified} currentlyTaking={r.currentlyTaking} showNet={showNet} />
            </Card>
          ))}
        </View>

        <ListSection>
          {gradesVerified ? (
            [
              <ListRow
                key="add"
                size="regular"
                icon="plus"
                title="Add a course you’re taking now"
                onPress={() => router.push('/t3?from=rates')}
              />,
              <ListRow
                key="grade"
                size="regular"
                icon="shield"
                title="Change a grade"
                subtitle="Grades are locked. Email noot support to change a grade."
                subtitleLines={2}
                onPress={() =>
                  Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Change%20a%20grade`).catch(() =>
                    Alert.alert('Email noot support', SUPPORT_EMAIL),
                  )
                }
              />,
            ]
          ) : (
            <ListRow
              size="regular"
              icon="plus"
              title="Add a course"
              subtitle="New courses need grade verification (~24h)"
              subtitleLines={2}
              onPress={() => router.push('/t3?from=rates')}
            />
          )}
        </ListSection>

        <View style={styles.footNote}>
          <Text style={[styles.footNoteText, { color: t.text3 }]}>
            Most tutors on campus charge $22–$34/hr.
          </Text>
        </View>
      </Body>
      <ActionBar>
        <Button label="Save changes" full onPress={save} disabled={saving} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gradeBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ratePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 2 },
  footNoteText: { flex: 1, fontSize: 12, lineHeight: 17.4 },
});
