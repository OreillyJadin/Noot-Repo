// TB1 New Booking Alert — ported from screens-tutorside.jsx (TB1).
// Push-style "New session booked" chip + handshake moment + student recap w/ payout.
// CTA → Session details (TB2). The CSS pulse-ring handshake animation doesn't
// translate to RN; we keep the static handshake badge and drop the rings.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Avatar, Divider, H1, Sub, Ic, useTheme } from '@noot/ui';
import { useApp, type BookingDraft } from '../lib/store';
import { DAYS, TUTORS, type Tutor } from '../lib/data';

const STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay', year: 'Sophomore', major: 'Pre-Business' };
const FEE_RATE = 0.175; // 15–20% platform fee; using 17.5% midpoint

function sessionFacts(booking: BookingDraft, tutor: Tutor) {
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1]!;
  const lengthMin = booking.lengthMin ?? 60;
  const lengthHours = lengthMin / 60;
  const lenLabel = lengthMin === 30 ? '30 min' : `${lengthHours} hr`;
  const slot = booking.slot ?? '3:00 PM';
  const location = booking.location ?? 'Gorgas Library, Fl 2';
  const course = booking.course ?? tutor.courses[0]![0];
  const courseMatch = tutor.courses.find((c) => c[0] === course) ?? tutor.courses[0]!;
  const rate = courseMatch[2];
  const gross = rate * lengthHours;
  const fee = gross * FEE_RATE;
  const payout = gross - fee;
  const online = location.startsWith('Online');
  return { dayObj, lengthHours, lenLabel, slot, location, course, rate, gross, fee, payout, online };
}

export default function TB1() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const tutor = booking.tutor ?? TUTORS[0]!;
  const f = sessionFacts(booking, tutor);
  const dayWord = f.dayObj.label === 'Today' ? 'today' : f.dayObj.label === 'Tomorrow' ? 'tomorrow' : f.dayObj.label;

  return (
    <Screen>
      <View style={{ height: insets.top }} />
      <Body pad={24}>
        {/* push-notification chip */}
        <View style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.dot, { backgroundColor: t.good }]} />
          <Text style={[styles.chipLabel, { color: t.text2 }]}>New session booked</Text>
        </View>

        <View style={styles.hero}>
          <View style={[styles.hsCircle, { backgroundColor: t.accent }]}>
            <Ic name="handshake" size={50} color={t.onAccent} strokeWidth={1.9} />
          </View>
          <H1 style={{ fontSize: 26, marginTop: 22, textAlign: 'center' }}>You&apos;ve got a session!</H1>
          <Sub style={{ marginTop: 8, maxWidth: 280, textAlign: 'center' }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{STUDENT.first}</Text> booked{' '}
            <Text style={{ color: t.text, fontWeight: '700' }}>{f.course}</Text> with you for {dayWord}.
          </Sub>
        </View>

        {/* quick recap */}
        <Card style={{ marginTop: 26, padding: 16 }}>
          <View style={styles.row}>
            <Avatar size={44} label={STUDENT.first[0]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>{STUDENT.name}</Text>
              <Text style={[styles.meta, { color: t.text3 }]}>{STUDENT.year} · {STUDENT.major}</Text>
            </View>
            <View style={[styles.confirmedPill, { backgroundColor: t.goodWeak }]}>
              <Ic name="check" size={11} color={t.good} strokeWidth={3} />
              <Text style={[styles.confirmedLabel, { color: t.good }]}>Confirmed</Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 14 }} />
          <View style={styles.row}>
            <Ic name="cal" size={17} color={t.accent} strokeWidth={1.8} />
            <Text style={{ fontSize: 14, color: t.text }}>{f.dayObj.label} · {f.slot}</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: t.good }}>+${f.payout.toFixed(2)}</Text>
          </View>
        </Card>
      </Body>
      <ActionBar>
        <Button label="View session details" kind="primary" full iconRight="chevron" onPress={() => router.push('/tb2')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'center',
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  chipLabel: { fontSize: 12, fontWeight: '600' },
  hero: { alignItems: 'center', paddingTop: 18 },
  hsCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13 },
  confirmedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  confirmedLabel: { fontSize: 11, fontWeight: '700' },
});
