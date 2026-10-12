// X4 Reschedule Request — ported from screens-changes.jsx (XRescheduleRequest).
// Old → proposed time comparison with an Accept / Decline choice.
import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@noot/core';
import { Screen, NavTop, Body, ActionBar, Button, Card, Avatar, Divider, Ic, H1, H2, Sub, HeroIcon, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { NoSession } from '../lib/NoSession';
import { useCounterpart } from '../lib/useCounterpart';
import { errText } from '../lib/errText';
import { formatSessionTime } from '../lib/formatSessionTime';

type Result = 'accepted' | 'declined' | null;

export default function XRescheduleRequest() {
  const { booking } = useApp();
  if (!booking.bookingId && !booking.tutor) return <NoSession />;
  return <XRescheduleRequestInner />;
}

function XRescheduleRequestInner() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking, role } = useApp();
  const student = useCounterpart(role === 'tutor' ? booking.studentId : undefined);
  const otherFirst = role === 'tutor' ? student.first : booking.tutor?.name.split(' ')[0] ?? 'your tutor';
  const proposedByOther = role === 'tutor' ? booking.studentId : booking.tutorId ?? booking.tutor?.id;
  const hasPendingProposal =
    !!booking.rescheduleProposedAt &&
    !!booking.rescheduleProposedBy &&
    !!proposedByOther &&
    booking.rescheduleProposedBy === proposedByOther;
  const newTime = booking.rescheduleProposedAt ? formatSessionTime(booking.rescheduleProposedAt) : '';
  const currentTime = booking.scheduledAt ? formatSessionTime(booking.scheduledAt) : '—';
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
    } catch (e) {
      Alert.alert('Could not update request', errText(e, 'Please try again.'));
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
                  Your session with {otherFirst} is now{' '}
                  <Text style={{ color: t.text, fontWeight: '700' }}>
                    {newTime}
                  </Text>
                  . Payment is unchanged and all reminders are updated.
                </>
              ) : (
                <>{otherFirst} will either honor the original time or cancel for a full refund.</>
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
          <Button kind="secondary" full label="Done" onPress={() => router.replace(role === 'tutor' ? '/tutor_home' : '/sessions')} />
        </ActionBar>
      </Screen>
    );
  }

  if (!hasPendingProposal) {
    return (
      <Screen>
        <NavTop onBack={() => router.back()} title="Reschedule request" />
        <Body pad={24}>
          <Text style={{ fontSize: 16, color: t.text2 }}>No pending request</Text>
        </Body>
        <ActionBar>
          <Button kind="secondary" full label="Back" onPress={() => router.back()} />
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
            <H2 style={{ fontSize: 18 }}>{otherFirst} wants to move your session</H2>
            <Text style={{ fontSize: 13, color: t.text3, marginTop: 2 }}>{booking.course ?? ''}</Text>
          </View>
        </View>

        <Card style={{ marginTop: 20, padding: 16 }}>
          <View style={styles.compareRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: t.text3, marginBottom: 3 }}>Was</Text>
              <Text style={[styles.strike, { color: t.text3 }]}>{currentTime}</Text>
            </View>
            <Ic name="arrow" size={20} color={t.accent} strokeWidth={2} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: t.accent, fontWeight: '600', marginBottom: 3 }}>New time</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{newTime}</Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 14 }} />
          <View style={styles.priceRow}>
            <Ic name="check" size={15} color={t.good} strokeWidth={2.4} />
            <Text style={{ fontSize: 13, color: t.text2 }}>
              Same price. Nothing else changes.
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
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
