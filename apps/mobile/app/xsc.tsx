// X1 Cancel Session (Student) — ported from screens-changes.jsx (XStudentCancel).
// Refund tier is derived from the REAL time until the session; the server is authoritative
// and its refund percent replaces the estimate once the cancellation goes through.
//
// This used to render a tap-to-switch "demo" selector that let the student choose their own
// refund tier so all three were visible. That is fabricated data in a screen about money —
// it implied a choice that doesn't exist and could show a full refund on a session starting
// in an hour. The tiers are now a read-only policy list with the applicable one marked.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Screen,
  NavTop,
  Body,
  ActionBar,
  Button,
  Card,
  Avatar,
  Divider,
  Ic,
  H1,
  Sub,
  Eyebrow,
  HeroIcon,
  useTheme,
} from '@noot/ui';
import { api } from '@noot/core';
import { useApp, type BookingDraft } from '../lib/store';
import { DAYS, type Tutor } from '../lib/data';
import { NoSession } from '../lib/NoSession';

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

type TierId = 'early' | 'mid' | 'late';
interface Tier {
  id: TierId;
  label: string;
  refundPct: number;
  tutorPct: number;
  note: string;
}

const TIERS: Tier[] = [
  { id: 'early', label: '> 24 hrs', refundPct: 1.0, tutorPct: 0, note: 'Full refund — no charge.' },
  { id: 'mid', label: '2–24 hrs', refundPct: 0.5, tutorPct: 0.5, note: "Half refund — your tutor is paid 50% for the reserved slot." },
  { id: 'late', label: '< 2 hrs', refundPct: 0, tutorPct: 1.0, note: 'No refund — the full amount goes to your tutor for the held time.' },
];

// Recap strip — student-side cancel always shows the tutor being cancelled on.
function SessionStrip({ booking, tutor }: { booking: BookingDraft; tutor: Tutor }) {
  const t = useTheme();
  const f = sessionFacts(booking, tutor);
  const name = tutor.name;
  const sub = `${f.course} · ${tutor.year}`;
  return (
    <Card flat style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surfaceAlt }}>
      <Avatar size={42} />
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

export default function XStudentCancel() {
  const { booking } = useApp();
  if (!booking.tutor) return <NoSession />;
  return <XStudentCancelInner />;
}

function XStudentCancelInner() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const tutor = booking.tutor!;
  const cost = baseCost(booking, tutor);
  // Which tier actually applies, from the booked start time. No session time (an older draft
  // that never carried one) → no tier is highlighted rather than guessing a favourable one.
  const hoursUntil = booking.scheduledAt
    ? (new Date(booking.scheduledAt).getTime() - Date.now()) / 3600000
    : null;
  const tier: TierId | null =
    hoursUntil == null ? null : hoursUntil > 24 ? 'early' : hoursUntil >= 2 ? 'mid' : 'late';
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // When a real booking is cancelled, the server decides the refund %; prefer it.
  const [serverRefund, setServerRefund] = useState<number | null>(null);
  const tobj = TIERS.find((x) => x.id === tier) ?? null;
  const tierRefund = tobj ? cost * tobj.refundPct : null;
  const refund = serverRefund ?? tierRefund;

  const onCancel = async () => {
    // Demo path: no real booking (e.g. reached via the dev launcher) — keep tier UI.
    if (!booking.bookingId) {
      setDone(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.bookings.cancel(booking.bookingId);
      setServerRefund(cost * (res.refundPercent / 100));
      setDone(true);
    } catch (e) {
      Alert.alert(
        'Could not cancel',
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name="check" size={72} />
            <H1 style={{ fontSize: 25, marginTop: 20 }}>Session cancelled</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260, textAlign: 'center' }}>
              {refund != null && refund > 0 ? (
                <>
                  A refund of <Text style={{ color: t.text, fontWeight: '700' }}>{money(refund)}</Text> is on its
                  way to your card — typically 5–10 business days via Stripe.
                </>
              ) : (
                <>No refund applies at this time. {tutor.name.split(' ')[0]!} has been notified.</>
              )}
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
        <SessionStrip booking={booking} tutor={tutor} />

        <View style={styles.demoRow}>
          <Eyebrow style={{ color: t.text3 }}>
            {hoursUntil == null
              ? 'Cancellation policy'
              : hoursUntil > 24
                ? `Cancelling more than 24 hrs ahead`
                : hoursUntil >= 2
                  ? `Cancelling ${Math.round(hoursUntil)} hrs before the session`
                  : 'Cancelling less than 2 hrs before the session'}
          </Eyebrow>
        </View>
        <View style={[styles.tierTrack, { backgroundColor: t.surface2 }]}>
          {TIERS.map((x) => {
            const on = tier === x.id;
            return (
              // Read-only: the tier is a fact about when you're cancelling, not a choice.
              <View key={x.id} style={styles.tierTab}>
                <Text
                  style={[
                    styles.tierTabLabel,
                    { color: on ? t.text : t.text3, backgroundColor: on ? t.surface : 'transparent' },
                  ]}
                >
                  {x.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* refund breakdown */}
        <Card style={{ marginTop: 16, padding: 16 }}>
          <View style={{ gap: 10 }}>
            <View style={styles.rowBetween}>
              <Text style={{ fontSize: 14, color: t.text2 }}>You paid</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{money(cost)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={{ fontSize: 14, color: t.text2 }}>Paid to tutor</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text3 }}>
                {tobj ? money(cost * tobj.tutorPct) : '—'}
              </Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 13 }} />
          <View style={[styles.rowBetween, { alignItems: 'baseline' }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>Refund to you</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: refund && refund > 0 ? t.good : t.text3 }}>
              {refund == null ? '—' : money(refund)}
            </Text>
          </View>
          <View style={styles.noteRow}>
            <View style={{ marginTop: 1 }}>
              <Ic name="shield" size={15} color={t.text3} strokeWidth={1.8} />
            </View>
            <Text style={{ fontSize: 12, color: t.text3, lineHeight: 17, flex: 1 }}>
              {tobj?.note ?? 'Your refund is calculated from how far ahead you cancel; the exact amount is confirmed when you cancel.'}
            </Text>
          </View>
        </Card>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <Button
          kind="primary"
          full
          disabled={submitting}
          label={
            submitting
              ? 'Cancelling…'
              : refund != null && refund > 0
                ? `Cancel & refund ${money(refund)}`
                : 'Cancel session'
          }
          onPress={onCancel}
        />
        <Text style={{ fontSize: 11, color: t.text3, textAlign: 'center' }}>
          Refund timing follows our cancellation policy.
        </Text>
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneWrap: { alignItems: 'center', paddingTop: 26 },
  demoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  tierTrack: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 13 },
  tierTab: { flex: 1 },
  tierTabLabel: { textAlign: 'center', paddingVertical: 9, borderRadius: 11, fontSize: 13, fontWeight: '600', overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 10 },
});
