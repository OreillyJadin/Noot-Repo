// X3 Propose Reschedule (Tutor) — ported from screens-changes.jsx (XReschedulePropose).
// Day/time picker mirrors B3's day-scroller + slot-grid pattern. Sending a request
// keeps payment unchanged and hands off to the student's Accept/Decline view (X4).
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, NavTop, Body, ActionBar, Button, Card, Ic, H1, Sub, Label, HeroIcon, useTheme } from '@noot/ui';
import { useApp, type BookingDraft } from '../lib/store';
import { TUTORS, DAYS, slotsFor, type Tutor } from '../lib/data';

const X_STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay' };

function sessionFacts(booking: BookingDraft, tutor: Tutor) {
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1]!;
  const slot = booking.slot ?? '3:00 PM';
  return { dayObj, slot };
}

export default function XReschedulePropose() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const tutor = booking.tutor ?? TUTORS[0]!;
  const slots = slotsFor(tutor.name.charCodeAt(0) % 5);
  const availableDays = DAYS.filter((d) => slots[d.i] && slots[d.i]!.length);
  const [day, setDay] = useState<number>(availableDays[1]?.i ?? availableDays[0]?.i ?? 0);
  const [slot, setSlot] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const f = sessionFacts(booking, tutor);
  const daySlots = slots[day] ?? [];
  const dayObj = DAYS.find((d) => d.i === day) ?? DAYS[0]!;

  if (sent) {
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name="clock" size={72} />
            <H1 style={{ fontSize: 24, marginTop: 20 }}>Request sent</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260, textAlign: 'center' }}>
              {X_STUDENT.first} will get a notification to accept or decline your new time. Payment stays unchanged.
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
          label={slot ? `Send request to ${X_STUDENT.first}` : 'Pick a time'}
          onPress={() => slot && setSent(true)}
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
