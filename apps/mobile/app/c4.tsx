// C4 · Feedback Confirmation — ported from screens-completion.jsx (C4).
// Role-dependent copy: tutors see a payout breakdown, students see a "how
// ratings work" explainer. Role is threaded in via the ?role= query param set
// by C2 ('student') / C3 ('tutor') on submit.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Divider, Ic, HeroIcon, useTheme } from '@noot/ui';
import { api, tutorPayoutFor, type Booking } from '@noot/core';
import { useMe } from '../lib/useMe';
import { useApp } from '../lib/store';
import { payoutRecap } from '../lib/payoutRecap';
import { BookAgainButton } from '../lib/BookAgainButton';


export default function C4() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const isTutor = role === 'tutor';

  // Recap counterpart comes from the in-progress booking draft (store), which B1/B2
  // populate from live @noot/core tutor data — no hardcoded demo tutor fallback.
  const tutor = booking.tutor;
  const { gradesVerified } = useMe();
  const tutorFirst = tutor?.name.split(' ')[0] ?? 'your tutor';

  const [retry, setRetry] = useState(0);
  const [read, setRead] = useState<{
    id?: string;
    status: 'loading' | 'ready' | 'error';
    data: Booking | null;
  }>({ status: 'loading', data: null });
  useEffect(() => {
    if (!isTutor || !booking.bookingId) return;
    let active = true;
    const id = booking.bookingId;
    setRead({ id, status: 'loading', data: null });
    api.bookings.get(id)
      .then((data) => {
        if (active) setRead({ id, status: data ? 'ready' : 'error', data });
      })
      .catch(() => {
        if (active) setRead({ id, status: 'error', data: null });
      });
    return () => { active = false; };
  }, [isTutor, booking.bookingId, retry]);

  const current = read.id === booking.bookingId ? read : null;
  const loading = isTutor && !!booking.bookingId && (!current || current.status === 'loading');
  const error = current?.status === 'error';
  const courseEntry = tutor?.courses.find((c) => c[0] === booking.course) ?? tutor?.courses[0];
  const rate = courseEntry?.[2] ?? 0;
  const lengthHours = (booking.lengthMin ?? 60) / 60;
  const gross = rate * lengthHours;
  // Fee follows the course's verification status: 17.5% verified, 32.5% otherwise.
  const payout = payoutRecap({
    actualAmount: current?.data?.tutorPayoutAmount ?? booking.tutorPayoutAmount,
    estimatedAmount: courseEntry ? tutorPayoutFor(gross, gradesVerified && !courseEntry[4]) : undefined,
    payoutFailedAt: current?.data?.payoutFailedAt,
    loading,
    error,
  });

  return (
    <Screen>
      <View style={{ height: insets.top + 8 }} />
      <Body pad={24}>
        <View style={styles.heroWrap}>
          <HeroIcon name={isTutor ? 'dollar' : 'check'} size={72} />
          <Text style={[styles.h1, { color: t.text, fontFamily: t.headingFont }]}>Thanks for the feedback.</Text>
          {isTutor ? (
            <Text style={[styles.sub, { color: t.text2, maxWidth: 270 }]}>
              {payout.message}
            </Text>
          ) : (
            <Text style={[styles.sub, { color: t.text2, maxWidth: 280 }]}>
              Your rating helps other students find great tutors.
            </Text>
          )}
        </View>

        {isTutor ? (
          <Card raised style={{ marginTop: 26, padding: 16 }}>
            <View style={styles.rowBetween}>
              <Text style={{ fontSize: 14, color: t.text2 }}>Destination</Text>
              <View style={styles.releasingTo}>
                <Ic name="card" size={15} color={t.text2} strokeWidth={1.7} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>Your Stripe account</Text>
              </View>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.rowBetweenBaseline}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{payout.label}</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: t.good }}>{payout.amount != null ? `$${payout.amount.toFixed(2)}` : '—'}</Text>
            </View>
            {error && booking.bookingId ? <Button label="Retry" kind="secondary" full onPress={() => setRetry((value) => value + 1)} /> : null}
          </Card>
        ) : (
          <View style={styles.footnoteRow}>
            <Ic name="bolt" size={18} color={t.accent} strokeWidth={1.8} />
            <Text style={[styles.cardText, { color: t.text2 }]}>
              Your rating feeds <Text style={{ fontWeight: '700', color: t.text }}>{tutorFirst}&apos;s</Text> standing
              in search. noot reviews feedback and decides when ratings publish — so scores stay fair and can&apos;t be gamed.
            </Text>
          </View>
        )}

        {!isTutor ? (
          <View style={[styles.footnoteRow, { marginTop: 12 }]}>
            <Ic name="shield" size={16} color={t.accent} strokeWidth={1.8} />
            <Text style={[styles.footnote, { color: t.text2 }]}>
              Ratings are never shown publicly the moment they&apos;re left. noot&apos;s team holds and releases them so the community
              stays trustworthy.
            </Text>
          </View>
        ) : null}

        <View style={[styles.footnoteRow, { marginTop: 12 }]}>
          <Ic name="clock" size={16} color={t.text3} strokeWidth={1.8} />
          <Text style={[styles.footnote, { color: t.text2 }]}>
            If neither side responds within <Text style={{ fontWeight: '700', color: t.text }}>24 hours</Text>, the session
            auto-completes and payout processing starts.
          </Text>
        </View>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        {!isTutor && tutor && booking.bookingId && booking.status === 'completed' ? (
          <BookAgainButton
            tutorId={tutor.id}
            course={booking.course ?? ''}
            durationMinutes={booking.lengthMin ?? 60}
            label={`Book again with ${tutorFirst}`}
          />
        ) : null}
        <Button label="Done" kind="secondary" full onPress={() => router.replace(isTutor ? '/tutor_home' : '/home')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroWrap: { alignItems: 'center', paddingTop: 24 },
  h1: { fontSize: 26, marginTop: 20, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBetweenBaseline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  releasingTo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footnoteRow: { marginTop: 26, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardText: { flex: 1, fontSize: 13, lineHeight: 19 },
  footnote: { flex: 1, fontSize: 12, lineHeight: 18 },
});
