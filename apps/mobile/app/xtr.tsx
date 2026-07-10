// X3 Propose Reschedule (Tutor) — ported from screens-changes.jsx (XReschedulePropose).
// Day/time picker mirrors B3's day-scroller + slot-grid pattern. Sending a request
// keeps payment unchanged and hands off to the student's Accept/Decline view (X4).
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, NavTop, Body, ActionBar, Button, Card, Ic, H1, Sub, Label, HeroIcon, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp, type BookingDraft } from '../lib/store';
import { DAYS } from '../lib/data';
import { slotsFromWindows } from '../lib/availability';
import { useMe } from '../lib/useMe';
import { useCounterpart } from '../lib/useCounterpart';

function sessionFacts(booking: BookingDraft) {
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1]!;
  const slot = booking.slot ?? '3:00 PM';
  return { dayObj, slot };
}

/** Combine a DAYS day-index + slot string ("3:00 PM") into an ISO timestamp.
 * DAYS starts at real today, so day-index N is today + N days. */
function scheduledAtISO(dayIndex: number, slot: string): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayIndex);
  const m = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (m) {
    let h = parseInt(m[1]!, 10) % 12;
    if (/PM/i.test(m[3]!)) h += 12;
    d.setHours(h, parseInt(m[2]!, 10), 0, 0);
  }
  return d.toISOString();
}

export default function XReschedulePropose() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const { me } = useMe();
  const student = useCounterpart(booking.studentId);
  // The tutor proposes a new time from their OWN real weekly availability.
  const [slots, setSlots] = useState<Record<number, string[]>>({});
  const availableDays = DAYS.filter((d) => slots[d.i] && slots[d.i]!.length);
  const [day, setDay] = useState<number>(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!me) return;
    let active = true;
    api.tutors
      .getAvailability(me.id)
      .then((windows) => {
        if (!active) return;
        const next = slotsFromWindows(windows);
        setSlots(next);
        const first = DAYS.find((d) => (next[d.i]?.length ?? 0) > 0);
        if (first) setDay(first.i);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [me]);

  const f = sessionFacts(booking);
  const daySlots = slots[day] ?? [];
  const dayObj = DAYS.find((d) => d.i === day) ?? DAYS[0]!;

  const send = async () => {
    if (!slot) return;
    // Reached via the dev launcher with no real booking — keep the demo behavior.
    if (!booking.bookingId) {
      setSent(true);
      return;
    }
    try {
      await api.bookings.reschedule({
        bookingId: booking.bookingId,
        action: 'propose',
        newScheduledAt: scheduledAtISO(day, slot),
      });
      setSent(true);
    } catch (e) {
      Alert.alert('Could not send request', 'Please check your connection and try again.');
    }
  };

  if (sent) {
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name="clock" size={72} />
            <H1 style={{ fontSize: 24, marginTop: 20 }}>Request sent</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260, textAlign: 'center' }}>
              {student.first} will get a notification to accept or decline your new time. Payment stays unchanged.
            </Sub>
          </View>
          <Card style={{ marginTop: 24, padding: 16 }}>
            <View style={styles.compareRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.compareLabel, { color: t.text3 }]}>From</Text>
                <Text style={[styles.compareOld, { color: t.text3 }]}>
                  {f.dayObj.label} · {f.slot}
                </Text>
              </View>
              <Ic name="arrow" size={18} color={t.accent} strokeWidth={2} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.compareLabel, { color: t.text3 }]}>Proposed</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>
                  {dayObj.label} · {slot}
                </Text>
              </View>
            </View>
          </Card>
        </Body>
        <ActionBar>
          <Button kind="secondary" full label="See student's view →" onPress={() => router.push('/xsr')} />
        </ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Propose new time" />
      <Body pad={20}>
        <Card flat style={{ padding: 12, backgroundColor: t.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ic name="cal" size={17} color={t.text3} strokeWidth={1.8} />
          <Text style={{ fontSize: 13, color: t.text2 }}>
            Current: <Text style={{ color: t.text, fontWeight: '700' }}>{f.dayObj.label} · {f.slot}</Text>
          </Text>
        </Card>

        <Label style={{ fontSize: 13, marginTop: 20, marginBottom: 10 }}>Pick a new day</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {DAYS.map((d) => {
            const has = !!(slots[d.i] && slots[d.i]!.length);
            const on = day === d.i;
            return (
              <Pressable
                key={d.i}
                disabled={!has}
                onPress={() => {
                  setDay(d.i);
                  setSlot(null);
                }}
                style={[
                  styles.dayCell,
                  { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.border, opacity: has ? 1 : 0.4 },
                ]}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: on ? t.onAccent : t.text3 }}>
                  {d.i === 0 ? 'Today' : d.dow}
                </Text>
                <Text style={{ fontSize: 19, fontWeight: '700', color: on ? t.onAccent : t.text, marginTop: 2 }}>{d.dom}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Label style={{ fontSize: 13, marginTop: 18, marginBottom: 10 }}>Available times · {dayObj.label}</Label>
        <View style={styles.slotGrid}>
          {daySlots.map((s) => {
            const on = slot === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSlot(s)}
                style={[styles.slotCell, { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.borderStrong }]}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.onAccent : t.text }}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </Body>
      <ActionBar>
        <Button
          kind="primary"
          full
          disabled={!slot}
          label={slot ? `Send request to ${student.first}` : 'Pick a time'}
          onPress={send}
        />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneWrap: { alignItems: 'center', paddingTop: 24 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compareLabel: { fontSize: 12, marginBottom: 3 },
  compareOld: { fontSize: 14, textDecorationLine: 'line-through' },
  dayRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  dayCell: { width: 58, paddingVertical: 10, borderRadius: 14, alignItems: 'center', borderWidth: 1.5 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCell: { width: '31%', paddingVertical: 11, alignItems: 'center', borderRadius: 13, borderWidth: 1.5 },
});
