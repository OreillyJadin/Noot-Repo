// Admin → Tutor approvals. Lists tutors awaiting review with their transcript link and
// approve/reject actions. Approve/reject go through api.admin.approveTutor → the approve-tutor
// Edge Function, which re-verifies admin server-side and is the ONLY writer of approval_status
// (0009 trigger). Client guard here is UI-only.
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Button, Badge, Ic, Eyebrow, EmptyState, Skeleton, useTheme } from '@noot/ui';
import { api, type PendingTutor } from '@noot/core';
import { useMe } from '../lib/useMe';

export default function AdminTutors() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');

  const [pending, setPending] = useState<PendingTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.admin
      .listPendingTutors()
      .then((list) => { if (alive) setPending(list); })
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
    if (busy) return;
    setBusy(tutor.userId);
    try {
      if (action === 'verify') await api.admin.verifyTutorGrades(tutor.userId);
      else if (action === 'reject') await api.admin.approveTutor(tutor.userId, 'rejected');
      else await api.admin.approveTutor(tutor.userId, 'approved', { verifyGrades: action === 'approveAndVerify' });
      setPending((prev) => prev.filter((p) => p.userId !== tutor.userId));
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

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
});
