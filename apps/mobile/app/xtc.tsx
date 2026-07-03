// X2 Cancel Session (Tutor) — ported from screens-changes.jsx (XTutorCancel).
// Student always gets a 100% refund; this screen surfaces the cancellation-rate
// impact and nudges toward proposing a reschedule instead. "Propose a reschedule
// instead" → Propose Reschedule (X3). "Cancel & refund" confirms, then Done → Home.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, NavTop, Body, ActionBar, Button, Card, Avatar, Ic, H1, Sub, HeroIcon, useTheme } from '@noot/ui';
import { useApp, type BookingDraft } from '../lib/store';
import { TUTORS, DAYS, type Tutor } from '../lib/data';

const X_STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay' };

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
function SessionStrip({ booking, tutor, who }: { booking: BookingDraft; tutor: Tutor; who: 'student' | 'tutor' }) {
  const t = useTheme();
  const f = sessionFacts(booking, tutor);
  const name = who === 'tutor' ? X_STUDENT.name : tutor.name;
  const sub = who === 'tutor' ? f.course : `${f.course} · ${tutor.year}`;
  return (
    <Card flat style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt }}>
      <Avatar size={42} label={who === 'tutor' ? X_STUDENT.first[0] : undefined} />
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

export default function XTutorCancel() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const tutor = booking.tutor ?? TUTORS[0]!;
  const cost = baseCost(booking, tutor);
  const [done, setDone] = useState(false);
  const cancelsThisMonth = 1; // tracked internally; flag at >2 / 30 days

  if (done) {
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name="check" size={72} />
            <H1 style={{ fontSize: 25, marginTop: 20 }}>Session cancelled</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260, textAlign: 'center' }}>
              {X_STUDENT.first} has been fully refunded {money(cost)}. This counts toward your cancellation rate.
            </Sub>
          </View>
        </Body>
        <ActionBar>
          <Button kind="secondary" full label="Done" onPress={() => router.replace('/home')} />
        </ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Cancel session" />
      <Body pad={20}>
        <SessionStrip booking={booking} tutor={tutor} who="tutor" />

        <Card style={{ marginTop: 16, padding: 16 }}>
          <View style={[styles.rowBetween, { marginBottom: 10 }]}>
            <Text style={{ fontSize: 14, color: t.text2 }}>{X_STUDENT.first} is refunded</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.good }}>{money(cost)} · 100%</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={{ fontSize: 14, color: t.text2 }}>You earn</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text3 }}>{money(0)}</Text>
          </View>
        </Card>

        {/* cancellation-rate warning */}
        <Card flat style={{ marginTop: 12, padding: 14, backgroundColor: t.accentWeak, borderWidth: 1, borderColor: t.accentBorder }}>
          <View style={styles.warnHead}>
            <Ic name="alert" size={17} color={t.accent} strokeWidth={1.9} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>This affects your cancellation rate</Text>
          </View>
          <Text style={{ fontSize: 13, color: t.text2, lineHeight: 19 }}>
            You&apos;ve cancelled <Text style={{ color: t.text, fontWeight: '700' }}>{cancelsThisMonth} session</Text> in the
            last 30 days. More than <Text style={{ color: t.text, fontWeight: '700' }}>2</Text> flags your account for
            review and can affect your ranking.
          </Text>
          <View style={styles.meterRow}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[styles.meterBar, { backgroundColor: i < cancelsThisMonth ? t.accent : t.surface2 }]}
              />
            ))}
          </View>
        </Card>

        <Text style={{ fontSize: 13, color: t.text3, lineHeight: 19, marginTop: 14, paddingHorizontal: 2 }}>
          Can&apos;t make the time? Consider <Text style={{ color: t.accent, fontWeight: '700' }}>proposing a reschedule</Text>{' '}
          instead — it keeps your payment and doesn&apos;t count against you.
        </Text>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <Button kind="secondary" full label="Propose a reschedule instead" onPress={() => router.push('/xtr')} />
        <Button kind="primary" full label={`Cancel & refund ${X_STUDENT.first}`} onPress={() => setDone(true)} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneWrap: { alignItems: 'center', paddingTop: 26 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  meterRow: { flexDirection: 'row', gap: 5, marginTop: 12 },
  meterBar: { flex: 1, height: 6, borderRadius: 3 },
});
