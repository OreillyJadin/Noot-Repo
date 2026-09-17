// B4 Payment — ported from screens-booking2.jsx (B4). Stripe Payment Element
// look: wallet buttons on top, card fields below, held-payment + cancellation
// policy notes. Reads the booking draft from useApp() with safe fallbacks so
// nothing renders undefined if a student lands here without going through B3.
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Badge, Eyebrow, Divider, Ic, useTheme } from '@noot/ui';
import { useStripe } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { DAYS, MONTHS } from '../lib/data';
import { NoSession } from '../lib/NoSession';

type Status = 'idle' | 'processing';

const POLICY_ROWS: [string, string, 'good' | 'neutral'][] = [
  ['24h+ before', 'Full refund', 'good'],
  ['2–24h before', '50% refund', 'neutral'],
  ['Under 2h', 'No refund', 'neutral'],
];

export default function B4() {
  const { booking } = useApp();
  if (!booking.tutor) return <NoSession />;
  return <B4Inner />;
}

function B4Inner() {
  const t = useTheme();
  const router = useRouter();
  const { booking, patchBooking } = useApp();

  const tutor = booking.tutor!;
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1] ?? DAYS[0]!;
  const lengthMin = booking.lengthMin ?? 60;
  const lenLabel = lengthMin === 30 ? '30 min' : `${lengthMin / 60} hr`;
  const slot = booking.slot ?? '3:00 PM';
  const location = booking.location ?? 'Gorgas Library, Fl 2';
  const course = booking.course ?? tutor.courses[0]![0];
  const rate = (tutor.courses.find((c) => c[0] === course) ?? tutor.courses[0]!)[2];
  const cost = ((rate * lengthMin) / 60).toFixed(2).replace(/\.00$/, '');

  const rows: [string, string][] = [
    ['Tutor', tutor.name],
    ['Course', course],
    ['Date', dayObj.label],
    ['Time', `${slot} · ${lenLabel}`],
    ['Location', location],
  ];

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [status, setStatus] = useState<Status>('idle');
  const [policyOpen, setPolicyOpen] = useState(false);

  // Build an ISO scheduledAt from the picked day + slot ("3:00 PM"), falling back
  // to now+1d if either is missing/unparseable so we never send a bad timestamp.
  const computeScheduledAt = (): string => {
    try {
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(slot.trim());
      const monthIdx = MONTHS.indexOf(dayObj.month);
      if (!m || monthIdx < 0) throw new Error('unparseable slot/day');
      let hh = Number(m[1]);
      const mm = Number(m[2]);
      const pm = m[3]!.toUpperCase() === 'PM';
      if (pm && hh !== 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
      const d = new Date(dayObj.year, monthIdx, dayObj.dom, hh, mm, 0, 0);
      if (Number.isNaN(d.getTime())) throw new Error('bad date');
      return d.toISOString();
    } catch {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
  };

  // Create a held (manual-capture) PaymentIntent, collect payment via Stripe's native
  // PaymentSheet (authorizes the hold), then create the booking through @noot/core and
  // stash its id for B5. When the backend has no Stripe key (dev/web) it returns a
  // simulated intent and we skip the sheet. Errors surface via Alert and reset to idle.
  const pay = async () => {
    if (status === 'processing') return;
    if (!booking.tutor) { setTimeout(() => router.push('/b5'), 600); return; }
    setStatus('processing');
    try {
      // The server derives the amount from the tutor's rate for this course (T5) — we
      // send only what identifies the session. `rate`/`cost` above are display only.
      const scheduledAt = computeScheduledAt();
      const pi = await api.createPaymentIntent({
        tutorId: booking.tutor.id,
        courseCode: course,
        durationMinutes: lengthMin,
        scheduledAt,
      });

      if (!pi.simulated) {
        // PaymentSheet needs the native SDK — absent in Expo Go. Guide the user to the dev build.
        if (Constants.appOwnership === 'expo') {
          setStatus('idle');
          Alert.alert('Use the Noot dev build', 'Card payment isn’t available in Expo Go — open the app from the dev/TestFlight build to pay.');
          return;
        }
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Noot',
          paymentIntentClientSecret: pi.paymentIntentClientSecret,
          customerId: pi.customerId ?? undefined,
          customerEphemeralKeySecret: pi.ephemeralKeySecret ?? undefined,
          applePay: { merchantCountryCode: 'US' },
          // testEnv must be false in a release build or Google Pay stays in test mode.
          googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
          returnURL: 'noot://stripe-redirect',
        });
        if (initErr) throw new Error(initErr.message);
        const { error: presentErr } = await presentPaymentSheet();
        if (presentErr) {
          if (presentErr.code === 'Canceled') { setStatus('idle'); return; } // user dismissed the sheet
          throw new Error(presentErr.message);
        }
      }

      // Set explicitly in B3, which only offers in-person for launch. The old code
      // re-derived this from the location's display string, which broke as soon as that
      // copy changed. Existing 'video' rows still render — we just don't sell them.
      const sessionType: 'video' | 'in_person' = booking.sessionType ?? 'in_person';
      const { bookingId } = await api.bookings.confirm({
        tutorId: booking.tutor.id,
        courseCode: course,
        scheduledAt,
        durationMinutes: lengthMin,
        sessionType,
        location,
        meetingLink: undefined,
        message: booking.message,
        paymentIntentId: pi.paymentIntentId,
      });
      patchBooking({ bookingId });
      router.push('/b5');
    } catch (err) {
      setStatus('idle');
      Alert.alert('Payment failed', err instanceof Error ? err.message : 'Something went wrong — please try again.');
    }
  };

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Confirm & pay" />
      <Body pad={20}>
        <Card style={{ padding: 16 }}>
          <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>Session summary</Eyebrow>
          <View style={{ gap: 10 }}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.rowBetween}>
                <Text style={{ fontSize: 14, color: t.text3 }}>{k}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text, textAlign: 'right' }}>{v}</Text>
              </View>
            ))}
          </View>
          <Divider style={{ marginVertical: 14 }} />
          <View style={styles.rowBetween}>
            <Text style={{ fontSize: 14, color: t.text2 }}>Session · {lenLabel}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>${cost}</Text>
          </View>
          <Divider style={{ marginVertical: 14 }} />
          <View style={styles.rowBetween}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>Total</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.accent }}>${cost}</Text>
          </View>
        </Card>

        <Eyebrow style={{ color: t.text3, marginTop: 24, marginBottom: 12 }}>Payment</Eyebrow>
        <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ic name="card" size={20} color={t.accent} strokeWidth={1.8} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.text }}>Card, Apple Pay or Google Pay</Text>
            <Text style={{ fontSize: 12.5, color: t.text3, marginTop: 2 }}>
              You&apos;ll enter payment in a secure Stripe sheet when you confirm.
            </Text>
          </View>
          <View style={styles.securedRow}>
            <Ic name="lock" size={12} color={t.text3} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, color: t.text3 }}>Stripe</Text>
          </View>
        </Card>

        <View style={styles.heldRow}>
          <View style={{ marginTop: 1 }}>
            <Ic name="lock" size={18} color={t.good} strokeWidth={1.8} />
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: t.text2, lineHeight: 19 }}>
            Payment held securely and released to your tutor after your session is complete.
          </Text>
        </View>

        <Card flat style={{ ...styles.policyCard, backgroundColor: t.surfaceAlt }}>
          <Pressable onPress={() => setPolicyOpen((o) => !o)} style={styles.policyHead}>
            <Ic name="shield" size={17} color={t.good} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 13, color: t.text2 }}>
              Free cancellation up to <Text style={{ color: t.text, fontWeight: '700' }}>24 hours</Text> before.
            </Text>
            <View style={styles.policyToggle}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: t.accent }}>{policyOpen ? 'Hide' : 'View policy'}</Text>
              <Ic name="chevdown" size={15} color={t.accent} strokeWidth={2} />
            </View>
          </Pressable>
          {policyOpen ? (
            <View style={[styles.policyBody, { borderTopColor: t.border }]}>
              {POLICY_ROWS.map(([when, amt, tone]) => (
                <View key={when} style={styles.rowBetween}>
                  <Text style={{ fontSize: 13, color: t.text2 }}>{when}</Text>
                  <Badge label={amt} tone={tone === 'good' ? 'good' : 'neutral'} />
                </View>
              ))}
              <Text style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>
                Refunds are processed to your original payment method via Stripe.
              </Text>
            </View>
          ) : null}
        </Card>
      </Body>

      <ActionBar>
        <Button label={`Confirm & pay $${cost}`} full onPress={pay} disabled={status === 'processing'} />
      </ActionBar>

      {/* Processing overlay — brief window while the sheet opens / booking is created. */}
      {status === 'processing' ? (
        <View style={[styles.processingOverlay, { backgroundColor: t.bg }]}>
          <ActivityIndicator size="large" color={t.accent} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: t.text }}>Processing payment…</Text>
            <Text style={{ fontSize: 13, color: t.text3, marginTop: 4 }}>Please don&apos;t close this screen.</Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  securedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  heldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingHorizontal: 2 },
  policyCard: { marginTop: 14, padding: 14 },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  policyBody: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 18 },
});
