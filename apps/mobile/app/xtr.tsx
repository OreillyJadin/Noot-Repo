// X3 Propose Reschedule — ported from screens-changes.jsx (XReschedulePropose).
// Day/time picker mirrors B3's day-scroller + slot-grid pattern. Sending a request
// keeps payment unchanged and hands off to the other party's Accept/Decline view (X4).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, NavTop, Body, ActionBar, Button, Card, Ic, H1, Sub, Label, HeroIcon, useTheme } from '@noot/ui';
import { campusInstant, campusSlotISO, addCampusDays, api, type BusyTime } from '@noot/core';
import { useApp, type BookingDraft } from '../lib/store';
import { BOOKABLE_DAYS, DAYS, MONTHS } from '../lib/data';
import { bookedSlots, slotsFromWindows } from '../lib/availability';
import { useMe } from '../lib/useMe';
import { useCounterpart } from '../lib/useCounterpart';
import { errText } from '../lib/errText';
import { formatSessionTime } from '../lib/formatSessionTime';

function sessionFacts(booking: BookingDraft) {
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1]!;
  const slot = booking.slot ?? '3:00 PM';
  return { dayObj, slot };
}

/** Combine a DAYS day-index + slot string ("3:00 PM") into an ISO timestamp.
 * DAYS starts at campus today, so day-index N is today + N days. */
function scheduledAtISO(dayIndex: number, slot: string): string {
  const day = DAYS[dayIndex]!;
  return campusSlotISO({ year: day.year, month: MONTHS.indexOf(day.month) + 1, day: day.dom }, slot);
}

export default function XReschedulePropose() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking, role } = useApp();
  const { me } = useMe();
  const student = useCounterpart(role === 'tutor' ? booking.studentId : undefined);
  const otherFirst = role === 'tutor' ? student.first : booking.tutor?.name.split(' ')[0] ?? 'your tutor';
  const availabilityTutorId = role === 'tutor' ? me?.id : booking.tutorId ?? booking.tutor?.id;
  const [slots, setSlots] = useState<Record<number, string[]>>({});
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [busy, setBusy] = useState<BusyTime[]>([]);
  const [busyLoading, setBusyLoading] = useState(true);
  const [day, setDay] = useState<number>(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const length = booking.lengthMin ?? 60;
  const booked = useMemo(() => bookedSlots(slots, busy, length), [slots, busy, length]);
  const didInitialSnap = useRef(false);
  const busyRange = useMemo(() => {
    const first = BOOKABLE_DAYS[0]!;
    const last = BOOKABLE_DAYS[BOOKABLE_DAYS.length - 1]!;
    return {
      from: campusInstant({ year: first.year, month: MONTHS.indexOf(first.month) + 1, day: first.dom }),
      to: campusInstant(addCampusDays({ year: last.year, month: MONTHS.indexOf(last.month) + 1, day: last.dom }, 1)),
    };
  }, []);

  useEffect(() => {
    if (!availabilityTutorId) {
      setSlotsLoading(false);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    api.tutors
      .getAvailability(availabilityTutorId)
      .then((windows) => {
        if (!active) return;
        setSlots(slotsFromWindows(windows, length));
      })
      .catch(() => { if (active) setSlots({}); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [availabilityTutorId, length]);

  useFocusEffect(useCallback(() => {
    if (!availabilityTutorId) {
      setBusy([]);
      setBusyLoading(false);
      return;
    }
    let active = true;
    setBusyLoading(true);
    api.tutors
      .getBusyTimes(availabilityTutorId, busyRange.from, busyRange.to, booking.bookingId)
      .then((ranges) => { if (active) setBusy(ranges); })
      .catch(() => { if (active) setBusy([]); })
      .finally(() => { if (active) setBusyLoading(false); });
    return () => { active = false; };
  }, [availabilityTutorId, booking.bookingId, busyRange]));

  useEffect(() => {
    if (!availabilityTutorId || slotsLoading || busyLoading || didInitialSnap.current) return;
    didInitialSnap.current = true;
    const first = BOOKABLE_DAYS.find((d) =>
      (slots[d.i] ?? []).some((s) => !booked[d.i]?.has(s)),
    );
    if (first) setDay(first.i);
  }, [availabilityTutorId, booked, busyLoading, slots, slotsLoading]);

  useEffect(() => {
    if (slotsLoading || busyLoading || !slot) return;
    if (!slots[day]?.includes(slot) || booked[day]?.has(slot)) setSlot(null);
  }, [booked, busyLoading, day, slot, slots, slotsLoading]);

  const f = sessionFacts(booking);
  const daySlots = slots[day] ?? [];
  const dayBooked = booked[day] ?? new Set<string>();
  const dayObj = BOOKABLE_DAYS.find((d) => d.i === day) ?? BOOKABLE_DAYS[0]!;

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
      Alert.alert('Could not send request', errText(e, 'Please try again.'));
    }
  };

  if (sent) {
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name="clock" size={72} />
            <H1 style={{ fontSize: 24, marginTop: 20 }}>Request sent to {otherFirst}</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260, textAlign: 'center' }}>
              They will get a notification to accept or decline your new time. Payment stays unchanged.
            </Sub>
          </View>
          <Card style={{ marginTop: 24, padding: 16 }}>
            <View style={styles.compareRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.compareLabel, { color: t.text3 }]}>From</Text>
                <Text style={[styles.compareOld, { color: t.text3 }]}>
                  {booking.scheduledAt ? formatSessionTime(booking.scheduledAt) : `${f.dayObj.label} · ${f.slot}`}
                </Text>
              </View>
              <Ic name="arrow" size={18} color={t.accent} strokeWidth={2} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.compareLabel, { color: t.text3 }]}>Proposed</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>
                  {formatSessionTime(scheduledAtISO(day, slot ?? '3:00 PM'))}
                </Text>
              </View>
            </View>
          </Card>
        </Body>
        <ActionBar>
          <Button kind="primary" full label="Done" onPress={() => router.replace(role === 'tutor' ? '/tutor_home' : '/sessions')} />
        </ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Propose a new time" />
      <Body pad={20}>
        <Card flat style={{ padding: 12, backgroundColor: t.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ic name="cal" size={17} color={t.text3} strokeWidth={1.8} />
          <Text style={{ fontSize: 13, color: t.text2 }}>
            Current:{' '}
            <Text style={{ color: t.text, fontWeight: '700' }}>
              {booking.scheduledAt ? formatSessionTime(booking.scheduledAt) : `${f.dayObj.label} · ${f.slot}`}
            </Text>
          </Text>
        </Card>

        <Label style={{ fontSize: 13, marginTop: 20, marginBottom: 10 }}>Pick a new day</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {BOOKABLE_DAYS.map((d) => {
            const has = !!(slots[d.i] && slots[d.i]!.length);
            const on = day === d.i;
            return (
              <Pressable
                key={d.i}
                disabled={!has}
                onPress={() => {
                  didInitialSnap.current = true;
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
            const isBooked = dayBooked.has(s);
            const on = slot === s && !isBooked;
            return (
              <Pressable
                key={s}
                disabled={isBooked}
                accessibilityLabel={isBooked ? `${s}, booked` : s}
                accessibilityState={{ disabled: isBooked }}
                onPress={() => setSlot(s)}
                style={[
                  styles.slotCell,
                  {
                    backgroundColor: isBooked ? t.surface2 : on ? t.accent : t.surface,
                    borderColor: isBooked ? t.border : on ? t.accent : t.borderStrong,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: isBooked ? t.text3 : on ? t.onAccent : t.text,
                    textDecorationLine: isBooked ? 'line-through' : 'none',
                  }}
                >
                  {s}
                </Text>
                {isBooked ? <Text style={{ fontSize: 10.5, color: t.text3 }}>Booked</Text> : null}
              </Pressable>
            );
          })}
        </View>
        {daySlots.length === 0 ? (
          <Text style={{ fontSize: 13, color: t.text3, paddingVertical: 4 }}>
            {slotsLoading || busyLoading ? 'Loading availability…' : 'No open times this day — try another.'}
          </Text>
        ) : null}
      </Body>
      <ActionBar>
        <Button
          kind="primary"
          full
          disabled={!slot}
          label={slot ? `Send request to ${otherFirst}` : 'Pick a time'}
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
  slotCell: { width: '31%', minHeight: 58, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 13, borderWidth: 1.5 },
});
