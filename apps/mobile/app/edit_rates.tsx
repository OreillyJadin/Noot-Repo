// P4 Courses & Rates (Edit) — ported from screens-edit.jsx (EditRates). Tutor-only
// settings editor for per-course hourly rates. "Add a course" jumps to the tutor
// application's Courses step (T3) — unless the tutor's grades are verified: then the
// course list and grades are locked (0048, ERR-012) and this screen only changes rates
// and removes courses. Wired to @noot/core: prefills the tutor's
// per-course rows (api.getMe → tutors.getById) and persists them on save via
// profile.setTutorCourses(...) — the contract method for per-course rate rows.
// (profile.updateRates(number) sets only a single base rate, which this
// per-course UI doesn't expose, so we persist each course row instead.)
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Alert, Linking, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Ic, useTheme } from '@noot/ui';
import { api, MIN_HOURLY_RATE, MAX_HOURLY_RATE } from '@noot/core';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';
import { SUPPORT_EMAIL } from '../lib/legal';

interface Rate {
  code: string;
  grade: string;
  rate: number;
  sessions: number;
}

export default function EditRates() {
  const t = useTheme();
  const { gradesVerified } = useMe();
  const router = useRouter();
  const [rates, setRates] = useState<Rate[]>([]);
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const bump = (i: number, d: number) =>
    setRates((rs) => rs.map((r, j) => (j === i ? { ...r, rate: Math.min(MAX_HOURLY_RATE, Math.max(MIN_HOURLY_RATE, r.rate + d)) } : r)));

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
      Alert.alert('Set a rate first', `Use + to set a rate for ${unset.map((r) => r.code).join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      await api.profile.setTutorCourses(
        rates.map((r) => ({
          courseCode: r.code,
          grade: r.grade || null,
          hourlyRate: r.rate,
        })),
      );
      Alert.alert('Rates updated');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', errText(e, 'Please check your connection and try again.'));
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

        <View style={{ gap: 10 }}>
          {rates.map((r, i) => (
            <Card key={r.code} style={{ padding: 14 }}>
              <View style={styles.row}>
                <View style={[styles.gradeBadge, { backgroundColor: t.accentWeak }]}>
                  <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>{r.grade}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{r.code}</Text>
                  {/* "verified" only once an admin has checked the transcript (T6). */}
                  <Text style={{ fontSize: 12, color: t.text3 }}>
                    {r.grade ? `Grade ${r.grade}${gradesVerified ? ' · verified' : ''}` : 'No grade'}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => bump(i, -1)} style={[styles.stepBtn, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
                    <Ic name="minus" size={15} color={t.text} strokeWidth={2.2} />
                  </Pressable>
                  <Text style={styles.rateText}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>${r.rate}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: t.text3 }}>/hr</Text>
                  </Text>
                  <Pressable onPress={() => bump(i, 1)} style={[styles.stepBtn, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
                    <Ic name="plus" size={15} color={t.text} strokeWidth={2.2} />
                  </Pressable>
                </View>
                {gradesVerified ? (
                  <Pressable
                    onPress={() => remove(r.code)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${r.code}`}
                  >
                    <Ic name="x" size={18} color={t.text3} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))}
        </View>

        {gradesVerified ? (
          <Card
            flat
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Add%20a%20course`)}
            style={{ marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt }}
          >
            <Ic name="shield" size={17} color={t.good} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>Your grades are verified</Text>
              <Text style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>
                Courses and grades are locked. Email noot support to add a course or change a grade.
              </Text>
            </View>
            <Ic name="chevR" size={16} color={t.text3} strokeWidth={2} />
          </Card>
        ) : (
          <Card
            flat
            onPress={() => router.push('/t3?from=rates')}
            style={{ marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt }}
          >
            <Ic name="plus" size={17} color={t.accent} strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>Add a course</Text>
              <Text style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>New courses need grade verification (~24h)</Text>
            </View>
            <Ic name="chevR" size={16} color={t.text3} strokeWidth={2} />
          </Card>
        )}

        <View style={styles.footNote}>
          <View style={{ marginTop: 1 }}>
            <Ic name="bolt" size={14} color={t.accent} strokeWidth={1.8} />
          </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gradeBadge: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rateText: { minWidth: 58, textAlign: 'center' },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 2 },
  footNoteText: { flex: 1, fontSize: 12, lineHeight: 17.4 },
});
