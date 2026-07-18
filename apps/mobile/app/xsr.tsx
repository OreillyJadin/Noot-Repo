// X4 Reschedule Request (Student) — ported from screens-changes.jsx (XRescheduleRequest).
// Old → new time comparison with an Accept / Decline choice. Price is unchanged
// either way. Accepting or declining both land on a confirmation, then Done → Home.
import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@noot/core';
import { Screen, NavTop, Body, ActionBar, Button, Card, Avatar, Divider, Ic, H1, H2, Sub, HeroIcon, useTheme } from '@noot/ui';
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

type Result = 'accepted' | 'declined' | null;

export default function XRescheduleRequest() {
  const { booking } = useApp();
  if (!booking.tutor) return <NoSession />;
  return <XRescheduleRequestInner />;
}

function XRescheduleRequestInner() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const tutor = booking.tutor!;
  const f = sessionFacts(booking, tutor);
  // TODO(api): no read exposes a pending reschedule proposal's new time to the student,
  // so the "New time" shown here is still a placeholder until that endpoint exists.
  const newDay = DAYS[3]!;
  const newSlot = '4:30 PM';
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  async function respond(action: 'accept' | 'decline') {
    if (busy) return;
    // No real booking (e.g. reached via the dev launcher): keep the local demo behavior.
    if (!booking.bookingId) {
      setResult(action === 'accept' ? 'accepted' : 'declined');
      return;
    }
    setBusy(true);
    try {
      await api.bookings.reschedule({ bookingId: booking.bookingId, action });
      setResult(action === 'accept' ? 'accepted' : 'declined');
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const accepted = result === 'accepted';
    return (
      <Screen>
        <View style={{ height: insets.top, flexShrink: 0 }} />
        <Body pad={24}>
          <View style={styles.doneWrap}>
            <HeroIcon name={accepted ? 'check' : 'x'} size={72} />
            <H1 style={{ fontSize: 24, marginTop: 20 }}>{accepted ? 'Session moved' : 'Request declined'}</H1>
            <Sub style={{ marginTop: 10, maxWidth: 264, textAlign: 'center' }}>
              {accepted ? (
                <>
                  Your session with {tutor.name.split(' ')[0]!} is now{' '}
                  <Text style={{ color: t.text, fontWeight: '700' }}>
                    {newDay.label} · {newSlot}
                  </Text>
                  . Payment is unchanged and all reminders are updated.
                </>
              ) : (
                <>{tutor.name.split(' ')[0]!} will either honor the original time or cancel for a full refund.</>
              )}
            </Sub>
          </View>
          <Card flat style={{ marginTop: 22, padding: 12, backgroundColor: t.surfaceAlt, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ marginTop: 1 }}>
              <Ic name="alert" size={16} color={t.text3} strokeWidth={1.8} />
            </View>
            <Text style={{ fontSize: 12, color: t.text2, lineHeight: 18, flex: 1 }}>
              After <Text style={{ color: t.text, fontWeight: '700' }}>3 reschedules</Text> of the same session, you&apos;re
              automatically refunded in full plus a credit for the inconvenience.
            </Text>
          </Card>
        </Body>
        <ActionBar>
          <Button kind="secondary" full label="Done" onPress={() => router.replace('/home')} />
        </ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Reschedule request" />
      <Body pad={20}>
        <View style={styles.headRow}>
          <Avatar size={48} />
          <View>
            <H2 style={{ fontSize: 18 }}>{tutor.name} wants to reschedule</H2>
            <Text style={{ fontSize: 13, color: t.text3, marginTop: 2 }}>{booking.course ?? ''}</Text>
          </View>
        </View>

        <Card style={{ marginTop: 20, padding: 16 }}>
          <View style={styles.compareRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: t.text3, marginBottom: 3 }}>Original</Text>
              <Text style={[styles.strike, { color: t.text3 }]}>{f.dayObj.label}</Text>
              <Text style={[styles.strikeSm, { color: t.text3 }]}>{f.slot}</Text>
            </View>
            <Ic name="arrow" size={20} color={t.accent} strokeWidth={2} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: t.accent, fontWeight: '600', marginBottom: 3 }}>New time</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{newDay.label}</Text>
              <Text style={{ fontSize: 13, color: t.text2 }}>{newSlot}</Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 14 }} />
          <View style={styles.priceRow}>
            <Ic name="check" size={15} color={t.good} strokeWidth={2.4} />
            <Text style={{ fontSize: 13, color: t.text2 }}>
              Same price · <Text style={{ color: t.text, fontWeight: '700' }}>{money(f.gross)}</Text>. Nothing else changes.
            </Text>
          </View>
        </Card>
      </Body>
      <ActionBar>
        <Button kind="secondary" size="md" label="Decline" style={{ flex: 1 }} disabled={busy} onPress={() => respond('decline')} />
        <Button kind="primary" label="Accept new time" style={{ flex: 1.6 }} disabled={busy} onPress={() => respond('accept')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneWrap: { alignItems: 'center', paddingTop: 24 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  strike: { fontSize: 15, textDecorationLine: 'line-through' },
  strikeSm: { fontSize: 13, textDecorationLine: 'line-through' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
