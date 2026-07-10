// X5 Report a No-Show — ported from screens-changes.jsx (XNoShow).
// A persona toggle previews both sides of the same flow: a student reporting a
// tutor no-show (full refund) and a tutor reporting a student no-show (payout +
// 3-strike policy). The signed-in role picks the starting persona. Done → Home.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, NavTop, Body, ActionBar, Button, Card, Avatar, Eyebrow, Ic, H1, Sub, HeroIcon, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp, type BookingDraft } from '../lib/store';
import { DAYS, type Tutor } from '../lib/data';
import { NoSession } from '../lib/NoSession';
import { useCounterpart } from '../lib/useCounterpart';

function money(n: number): string {
  return '$' + n.toFixed(2).replace('.00', '');
}

function sessionFacts(booking: BookingDraft, tutor: Tutor) {
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1]!;
  const slot = booking.slot ?? '3:00 PM';
  const course = booking.course ?? tutor.courses[0]![0];
  const courseRow = tutor.courses.find((c) => c[0] === course) ?? tutor.courses[0]!;
  const lengthMin = booking.lengthMin ?? 60;
  const gross = courseRow[2] * (lengthMin / 60);
  return { dayObj, slot, course, gross };
}

function baseCost(booking: BookingDraft, tutor: Tutor): number {
  return sessionFacts(booking, tutor).gross;
}

// Recap strip reused across the exceptions screens (inlined per-file — see PORTING_GUIDE).
function SessionStrip({ booking, tutor, who, studentName }: { booking: BookingDraft; tutor: Tutor; who: 'student' | 'tutor'; studentName: string }) {
  const t = useTheme();
  const f = sessionFacts(booking, tutor);
  const name = who === 'tutor' ? studentName : tutor.name;
  const sub = who === 'tutor' ? f.course : `${f.course} · ${tutor.year}`;
  return (
    <Card flat style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt }}>
      <Avatar size={42} label={who === 'tutor' ? studentName[0] : undefined} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{name}</Text>
        <Text style={{ fontSize: 13, color: t.text3 }}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>{f.dayObj.label}</Text>
        <Text style={{ fontSize: 12, color: t.text3 }}>{f.slot}</Text>
      </View>
    </Card>
  );
}

const STRIKES: [string, string, boolean][] = [
  ['1st no-show', 'Warning + loses any cancellation credits', true],
  ['2nd no-show', 'Must pre-pay all sessions, no refunds for 30 days', false],
  ['3rd no-show', 'Account suspended pending review', false],
];

export default function XNoShow() {
  const { booking } = useApp();
  if (!booking.tutor) return <NoSession />;
  return <XNoShowInner />;
}

function XNoShowInner() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking, role } = useApp();
  const student = useCounterpart(booking.studentId);
  const tutor = booking.tutor!;
  const cost = baseCost(booking, tutor);
  const [persona, setPersona] = useState<'student' | 'tutor'>(role === 'tutor' ? 'tutor' : 'student');
  const [done, setDone] = useState(false);

  if (done) {
    const studentMarked = persona === 'student';
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name={studentMarked ? 'check' : 'dollar'} size={72} />
            <H1 style={{ fontSize: 24, marginTop: 20 }}>{studentMarked ? 'Reported — full refund' : 'No-show recorded'}</H1>
            <Sub style={{ marginTop: 10, maxWidth: 264, textAlign: 'center' }}>
              {studentMarked ? (
                <>
                  You&apos;ll be refunded <Text style={{ color: t.text, fontWeight: '700' }}>{money(cost)}</Text> in full.
                  This impacts {tutor.name.split(' ')[0]!}&apos;s cancellation rate.
                </>
              ) : (
                <>
                  Payment of <Text style={{ color: t.text, fontWeight: '700' }}>{money(cost)}</Text> is processed to you
                  automatically — no review needed for routine no-shows.
                </>
              )}
            </Sub>
          </View>

          {!studentMarked ? (
            <Card style={{ marginTop: 22, padding: 16 }}>
              <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>{student.first}&apos;s record · 3-strike policy</Eyebrow>
              {STRIKES.map(([k, v, active], i) => (
                <View key={k} style={[styles.strikeRow, i < 2 ? { borderBottomWidth: 1, borderBottomColor: t.border } : null]}>
                  <View style={[styles.strikeBadge, { backgroundColor: active ? t.accent : t.surface2 }]}>
                    <Text style={{ color: active ? t.onAccent : t.text3, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? t.text : t.text3 }}>
                      {k}
                      {active ? ' · now' : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: t.text3 }}>{v}</Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
        </Body>
        <ActionBar>
          <Button kind="secondary" full label="Done" onPress={() => router.replace('/home')} />
        </ActionBar>
      </Screen>
    );
  }

  const studentView = persona === 'student';

  // party = who didn't show. In the student view the tutor is the no-show; in the
  // tutor view the student is the no-show (mirrors the button labels below).
  const submit = async () => {
    const party: 'student' | 'tutor' = studentView ? 'tutor' : 'student';
    if (!booking.bookingId) {
      setDone(true);
      return;
    }
    try {
      await api.bookings.reportNoShow({ bookingId: booking.bookingId, party });
      setDone(true);
    } catch (e) {
      Alert.alert('Something went wrong', "Couldn't report the no-show. Please try again.");
    }
  };

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Report a no-show" />
      <Body pad={20}>
        <SessionStrip booking={booking} tutor={tutor} who={studentView ? 'student' : 'tutor'} studentName={student.name} />

        <Card style={{ marginTop: 16, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={[styles.clockIcon, { backgroundColor: t.accentWeak }]}>
            <Ic name="clock" size={19} color={t.accent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>
              {studentView ? `${tutor.name.split(' ')[0]!} is 15+ minutes late` : `${student.first} hasn't shown up`}
            </Text>
            <Text style={{ fontSize: 13, color: t.text2, marginTop: 4, lineHeight: 19 }}>
              {studentView
                ? 'If your tutor is 15 minutes late with no message, you can mark them as a no-show for a full refund.'
                : 'You can report a student no-show up to 1 hour after the scheduled start. Payment processes to you automatically.'}
            </Text>
          </View>
        </Card>

        <Card flat style={{ marginTop: 12, padding: 14, backgroundColor: t.surfaceAlt, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, color: t.text2 }}>{studentView ? 'Your refund' : 'Your payout'}</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.good }}>{money(cost)}</Text>
        </Card>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <Button
          kind="primary"
          full
          label={studentView ? "Tutor didn't show" : "Student didn't show"}
          onPress={submit}
        />
        <Text
          onPress={() => setPersona(studentView ? 'tutor' : 'student')}
          style={{ fontSize: 12.5, color: t.text3, textAlign: 'center' }}
        >
          Demo: preview the {studentView ? 'tutor' : 'student'} side →
        </Text>
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneWrap: { alignItems: 'center', paddingTop: 22 },
  strikeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8 },
  strikeBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clockIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
