// Admin → Tutor approvals. Lists tutors awaiting review with their transcript link and
// approve/reject actions. Approve/reject go through api.admin.approveTutor → the approve-tutor
// Edge Function, which re-verifies admin server-side and is the ONLY writer of approval_status
// (0009 trigger). Client guard here is UI-only.
//
// Each new application also offers interview times taken from the applicant's own weekly
// availability (ERR-005): tap one to schedule it; the tutor is notified. Scheduling is
// admin-only on the server (schedule_tutor_interview, 0042) and does not gate approval.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Button, Badge, Field, Ic, Eyebrow, EmptyState, Skeleton, useTheme } from '@noot/ui';
import { api, type PendingTutor, type TutorInterview } from '@noot/core';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';
import { interviewLabel, nextInterviewSlots } from '../lib/interviewSlots';

export default function AdminTutors() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');

  const [pending, setPending] = useState<PendingTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Per applicant: the interview already set, the times their availability offers, and the
  // meeting link/place the admin is typing. `changing` reopens the times for a set interview.
  const [interviews, setInterviews] = useState<Record<string, TutorInterview>>({});
  const [slots, setSlots] = useState<Record<string, Date[]>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState<string | null>(null);
  // Applicants whose interview or availability couldn't be read. Never shown as "none set" or
  // "no availability": scheduling over an interview we failed to load would notify them twice.
  const [unread, setUnread] = useState<Record<string, boolean>>({});
  // The Alert callbacks below outlive the render they were created in, so the in-flight
  // check reads a ref rather than the `busy` they captured.
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    api.admin
      .listPendingTutors()
      .then(async (list) => {
        if (!alive) return;
        setPending(list);
        // Interviews are only for applications still to be decided, not live tutors' grade checks.
        const applicants = list.filter((p) => p.awaiting === 'application').map((p) => p.userId);
        const [set, windows] = await Promise.all([
          api.admin.listInterviews(applicants).catch(() => null),
          Promise.all(applicants.map((id) => api.tutors.getAvailability(id).catch(() => null))),
        ]);
        if (!alive) return;
        setInterviews(set ?? {});
        const now = new Date();
        setSlots(Object.fromEntries(applicants.map((id, i) => [id, nextInterviewSlots(windows[i] ?? [], now)])));
        setUnread(Object.fromEntries(applicants.map((id, i) => [id, set === null || windows[i] === null])));
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  // Approving and verifying grades are separate (T6): approval puts the tutor live;
  // verifying the transcript adds the Verified badge and the lower fee.
  const decide = async (
    tutor: PendingTutor,
    action: 'approve' | 'approveAndVerify' | 'reject' | 'verify',
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(tutor.userId);
    try {
      if (action === 'verify') await api.admin.verifyTutorGrades(tutor.userId);
      else if (action === 'reject') await api.admin.approveTutor(tutor.userId, 'rejected');
      else await api.admin.approveTutor(tutor.userId, 'approved', { verifyGrades: action === 'approveAndVerify' });
      setPending((prev) => prev.filter((p) => p.userId !== tutor.userId));
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const schedule = (tutor: PendingTutor, at: Date) => {
    const where = (details[tutor.userId] ?? '').trim();
    Alert.alert(
      'Schedule interview?',
      `${tutor.name} · ${interviewLabel(at)}${where ? `\n${where}` : ''}\n\nThey’ll be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Schedule',
          onPress: async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(tutor.userId);
            try {
              const saved = await api.admin.scheduleInterview(tutor.userId, at.toISOString(), where);
              setInterviews((m) => ({ ...m, [tutor.userId]: saved }));
              setChanging(null);
            } catch (e) {
              Alert.alert('Could not schedule', errText(e, 'Please try again.'));
            } finally {
              inFlight.current = false;
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const cancelInterview = (tutor: PendingTutor) =>
    Alert.alert('Cancel interview?', `${tutor.name} will be told it’s off.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel interview',
        style: 'destructive',
        onPress: async () => {
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(tutor.userId);
          try {
            await api.admin.cancelInterview(tutor.userId);
            setInterviews((m) => {
              const { [tutor.userId]: _gone, ...rest } = m;
              return rest;
            });
          } catch (e) {
            Alert.alert('Could not cancel', errText(e, 'Please try again.'));
          } finally {
            inFlight.current = false;
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <Screen>
      <NavTop title="Tutor approvals" onBack={() => router.back()} />
      <Body pad={20}>
        {loading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={150} radius={16} />
            <Skeleton height={150} radius={16} />
          </View>
        ) : pending.length === 0 ? (
          <EmptyState icon="check" title="All caught up" subtitle="No tutors are waiting for review." />
        ) : (
          <View style={{ gap: 12 }}>
            <Eyebrow style={{ color: t.text3 }}>{pending.length} awaiting review</Eyebrow>
            {pending.map((tutor) => (
              <Card key={tutor.userId} style={{ padding: 16 }}>
                <View style={styles.headRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { color: t.text }]}>{tutor.name}</Text>
                    <Text style={[styles.meta, { color: t.text3 }]}>
                      {[tutor.year, tutor.major].filter(Boolean).join(' · ') || '—'} · {tutor.email}
                    </Text>
                  </View>
                  <Badge
                    label={tutor.awaiting === 'grades' ? 'Live · grade check' : tutor.hasTranscript ? 'New · transcript' : 'New · unverified'}
                    tone={tutor.awaiting === 'grades' ? 'neutral' : 'accentSoft'}
                  />
                </View>

                {tutor.bio ? <Text style={[styles.bio, { color: t.text2 }]}>{tutor.bio}</Text> : null}

                <View style={styles.subjRow}>
                  {tutor.subjects.map((s) => (
                    <Badge key={s} label={s} tone="neutral" />
                  ))}
                </View>

                <Card
                  flat
                  onPress={tutor.transcriptUrl ? () => Linking.openURL(tutor.transcriptUrl!) : undefined}
                  style={{ ...styles.transcript, backgroundColor: t.surfaceAlt }}
                >
                  <Ic name="doc" size={16} color={tutor.transcriptUrl ? t.accent : t.text3} strokeWidth={1.8} />
                  <Text style={[styles.transcriptText, { color: tutor.transcriptUrl ? t.accent : t.text3 }]}>
                    {tutor.transcriptUrl
                      ? 'View transcript'
                      : tutor.hasTranscript
                        ? 'Transcript link unavailable — reload'
                        : 'No transcript — signed up unverified'}
                  </Text>
                </Card>

                {tutor.awaiting === 'application' ? (
                  <View style={[styles.interview, { borderTopColor: t.border }]}>
                    <Eyebrow style={{ color: t.text3 }}>Interview</Eyebrow>
                    {unread[tutor.userId] ? (
                      <Text style={[styles.interviewDetails, { color: t.text3 }]}>
                        Couldn’t load this applicant’s interview details. Reopen this screen to try again.
                      </Text>
                    ) : interviews[tutor.userId] && changing !== tutor.userId ? (
                      <>
                        <View style={styles.interviewSet}>
                          <Ic name="clock" size={16} color={t.accent} strokeWidth={1.9} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.interviewWhen, { color: t.text }]}>
                              {interviewLabel(new Date(interviews[tutor.userId]!.scheduledAt))}
                            </Text>
                            {interviews[tutor.userId]!.details ? (
                              <Text style={[styles.interviewDetails, { color: t.text3 }]}>
                                {interviews[tutor.userId]!.details}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.interviewLinks}>
                          <Text
                            onPress={() => {
                              setDetails((m) => ({ ...m, [tutor.userId]: interviews[tutor.userId]!.details }));
                              setChanging(tutor.userId);
                            }}
                            accessibilityRole="button"
                            style={[styles.link, { color: t.accent }]}
                          >
                            Change time
                          </Text>
                          <Text
                            onPress={() => cancelInterview(tutor)}
                            accessibilityRole="button"
                            style={[styles.link, { color: t.text3 }]}
                          >
                            Cancel interview
                          </Text>
                        </View>
                      </>
                    ) : (slots[tutor.userId] ?? []).length === 0 ? (
                      <>
                        <Text style={[styles.interviewDetails, { color: t.text3 }]}>
                          {slots[tutor.userId] ? 'No availability in the next two weeks to suggest a time from.' : 'Loading their availability…'}
                        </Text>
                        {changing === tutor.userId ? (
                          <Text onPress={() => setChanging(null)} accessibilityRole="button" style={[styles.link, { color: t.text3 }]}>
                            Keep the current time
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Field
                          label="Meeting link or place (optional)"
                          value={details[tutor.userId] ?? ''}
                          onChangeText={(v) => setDetails((m) => ({ ...m, [tutor.userId]: v.slice(0, 500) }))}
                          placeholder="e.g. a video link, or Gorgas Library lobby"
                        />
                        <Text style={[styles.interviewDetails, { color: t.text3 }]}>
                          Times from their availability, shown in this phone’s time zone — tap one to schedule.
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          contentContainerStyle={styles.slotRow}
                        >
                          {(slots[tutor.userId] ?? []).map((at) => (
                            <Pressable
                              key={at.getTime()}
                              onPress={() => schedule(tutor, at)}
                              disabled={busy !== null}
                              accessibilityRole="button"
                              accessibilityLabel={`Schedule interview ${interviewLabel(at)}`}
                              style={[styles.slot, { borderColor: t.accentBorder, backgroundColor: t.accentWeak }]}
                            >
                              <Text style={[styles.slotText, { color: t.accent }]}>{interviewLabel(at)}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                        {changing === tutor.userId ? (
                          <Text onPress={() => setChanging(null)} accessibilityRole="button" style={[styles.link, { color: t.text3 }]}>
                            Keep the current time
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ) : null}

                {tutor.awaiting === 'grades' ? (
                  <View style={styles.actions}>
                    <Button
                      label="Mark grades verified"
                      kind="primary"
                      size="md"
                      style={{ flex: 1 }}
                      disabled={busy === tutor.userId}
                      onPress={() => decide(tutor, 'verify')}
                    />
                  </View>
                ) : (
                  <View style={{ gap: 10, marginTop: 14 }}>
                    {tutor.hasTranscript ? (
                      <Button
                        label="Approve & verify grades"
                        kind="primary"
                        size="md"
                        full
                        disabled={busy === tutor.userId}
                        onPress={() => decide(tutor, 'approveAndVerify')}
                      />
                    ) : null}
                    <View style={[styles.actions, { marginTop: 0 }]}>
                      <Button
                        label="Reject"
                        kind="secondary"
                        size="md"
                        style={{ flex: 1 }}
                        disabled={busy === tutor.userId}
                        onPress={() => decide(tutor, 'reject')}
                      />
                      <Button
                        label={tutor.hasTranscript ? 'Approve, unverified' : 'Approve (unverified)'}
                        kind={tutor.hasTranscript ? 'secondary' : 'primary'}
                        size="md"
                        style={{ flex: 1.4 }}
                        disabled={busy === tutor.userId}
                        onPress={() => decide(tutor, 'approve')}
                      />
                    </View>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 2 },
  bio: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  subjRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  transcript: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginTop: 12 },
  transcriptText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  interview: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  interviewSet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  interviewWhen: { fontSize: 14.5, fontWeight: '700' },
  interviewDetails: { fontSize: 12.5, lineHeight: 18 },
  interviewLinks: { flexDirection: 'row', gap: 18 },
  link: { fontSize: 13, fontWeight: '600' },
  slotRow: { gap: 8, paddingVertical: 2 },
  slot: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1 },
  slotText: { fontSize: 13, fontWeight: '700' },
});
