// C4 · Feedback Confirmation — ported from screens-completion.jsx (C4).
// Role-dependent copy: tutors see a payout breakdown, students see a "how
// ratings work" explainer. Role is threaded in via the ?role= query param set
// by C2 ('student') / C3 ('tutor') on submit.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Divider, Ic, HeroIcon, useTheme } from '@noot/ui';
import { tutorPayoutFor } from '@noot/core';
import { useMe } from '../lib/useMe';
import { useApp } from '../lib/store';
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

  // Net payout is derived from the booking draft's real tutor rate + length (no fake
  // fallback). TODO(api): read the booking's exact tutor_payout_amount once a
  // single-booking read exists — this mirrors the server's fee math for now.
  const courseEntry = tutor?.courses.find((c) => c[0] === booking.course) ?? tutor?.courses[0];
  const rate = courseEntry?.[2] ?? 0;
  const lengthHours = (booking.lengthMin ?? 60) / 60;
  const gross = rate * lengthHours;
  // Fee follows the course's verification status: 17.5% verified, 32.5% otherwise.
  const payout = booking.tutorPayoutAmount ?? tutorPayoutFor(gross, gradesVerified && !courseEntry?.[4]);

  return (
    <Screen>
      <View style={{ height: insets.top + 8 }} />
      <Body pad={24}>
        <View style={styles.heroWrap}>
          <HeroIcon name={isTutor ? 'dollar' : 'check'} size={72} />
          <Text style={[styles.h1, { color: t.text }]}>Thanks for the feedback.</Text>
          {isTutor ? (
            <Text style={[styles.sub, { color: t.text2, maxWidth: 270 }]}>
              Payment of <Text style={{ fontWeight: '700', color: t.text }}>${payout.toFixed(2)}</Text> will be released to your
              Stripe account within <Text style={{ fontWeight: '700', color: t.text }}>2 business days</Text>.
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
              <Text style={{ fontSize: 14, color: t.text2 }}>Releasing to</Text>
              <View style={styles.releasingTo}>
                <Ic name="card" size={15} color={t.text2} strokeWidth={1.7} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>Your Stripe account</Text>
              </View>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.rowBetweenBaseline}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>Net payout</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: t.good }}>${payout.toFixed(2)}</Text>
            </View>
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
            auto-completes and payment is released.
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
  h1: { fontSize: 26, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBetweenBaseline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  releasingTo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footnoteRow: { marginTop: 26, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardText: { flex: 1, fontSize: 13, lineHeight: 19 },
  footnote: { flex: 1, fontSize: 12, lineHeight: 18 },
});
