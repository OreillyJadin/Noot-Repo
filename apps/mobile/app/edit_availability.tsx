// P5 Set Availability (Edit) — the tutor's recurring weekly template. Distinct from the
// Calendar tab (day-by-day agenda + one-off slot toggles), linked from the intro copy.
// Wired to @noot/core: the hour grid is folded into weekly windows and persisted via
// profile.updateAvailability(...).
//
// The picker itself is <AvailabilityEditor>, shared with onboarding step 5 (ERR-013).
//
// GRANULARITY: this used to offer three coarse blocks (Morning 8a–12p, Afternoon 12–5p,
// Evening 5–10p), so the smallest thing a tutor could offer was a four-hour stretch. Nothing
// downstream required that — the DB stores arbitrary start/end windows and the student-side
// picker already generates hourly starts (lib/availability.ts) — so the blocks were purely a
// limitation of this screen. It's now hour-by-hour: a tutor can open 3–4pm alone.
//
// Contiguous selected hours are merged into a single window on save (09,10,11 → 09:00–12:00)
// so the stored shape stays the same handful of rows it always was, and existing saved
// windows load back correctly whatever granularity they were written at.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, useTheme } from '@noot/ui';
import { api, formatCampusTime, type TutorInterview } from '@noot/core';
import { useMe } from '../lib/useMe';
import { AvailabilityEditor } from '../lib/AvailabilityEditor';
import { INTERVIEW_MINUTES } from '../lib/interviewBlock';
import { interviewLabel } from '../lib/interviewSlots';
import { emptyGrid, gridFromWindows, windowsFromGrid, type WeekGrid } from '../lib/weekGrid';

export default function EditAvailability() {
  const t = useTheme();
  const router = useRouter();
  const { me } = useMe();
  const [av, setAv] = useState<WeekGrid>(emptyGrid);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [interview, setInterview] = useState<TutorInterview | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!me) return;
    let active = true;
    api.tutors
      .getAvailability(me.id)
      .then((windows) => { if (active) setAv(gridFromWindows(windows)); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Keyed on the id, not the object: useMe re-reads in the background (S1), and
    // re-seeding on every re-read would wipe edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      if (!me?.id) {
        setInterview(null);
        return;
      }
      let active = true;
      const timer = setInterval(() => { if (active) setNow(Date.now()); }, 30_000);
      api.profile
        .getMyInterview()
        .then((iv) => { if (active) setInterview(iv); })
        .catch(() => { /* availability editing still works without an interview notice */ });
      return () => { active = false; clearInterval(timer); };
    }, [me?.id]),
  );

  const interviewAt = interview ? new Date(interview.scheduledAt) : null;
  const interviewEnd = interviewAt
    ? new Date(interviewAt.getTime() + INTERVIEW_MINUTES * 60 * 1000)
    : null;
  const hasLiveInterview = interviewAt !== null && interviewEnd !== null && now !== null && interviewEnd.getTime() > now;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.profile.updateAvailability(windowsFromGrid(av));
      Alert.alert('Availability saved');
      router.back();
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Set availability" onBack={() => router.back()} />
      <Body>
        {hasLiveInterview && interviewAt && interviewEnd ? (
          <View style={[styles.interviewCard, { backgroundColor: t.dangerWeak, borderColor: t.danger }]}>
            <Text style={[styles.interviewTitle, { color: t.text }]}>
              Interview with noot · {interviewLabel(interviewAt)} – {formatCampusTime(interviewEnd)}
            </Text>
            <Text style={[styles.interviewBody, { color: t.text2 }]}>
              This hour is blocked and can't be booked.
            </Text>
          </View>
        ) : null}
        <Text style={[styles.intro, { color: t.text2 }]}>
          Your typical week, hour by hour. Students can request any hour you turn on. To block or open a single day, use the{' '}
          <Text onPress={() => router.push('/tutor_calendar')} style={{ color: t.accent, fontWeight: '600' }}>
            Calendar
          </Text>
          .
        </Text>

        <AvailabilityEditor value={av} onChange={setAv} />
      </Body>
      <ActionBar>
        <Button label={loading ? 'Loading…' : 'Save changes'} full onPress={save} disabled={saving || loading} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  interviewCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  interviewTitle: { fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  interviewBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 4 },
});
