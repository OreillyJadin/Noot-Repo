// B4 Payment — ported from screens-booking2.jsx (B4). Stripe Payment Element
// look: wallet buttons on top, card fields below, held-payment + cancellation
// policy notes. Reads the booking draft from useApp() with safe fallbacks so
// nothing renders undefined if a student lands here without going through B3.
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Chip, Badge, Eyebrow, Divider, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { DAYS, MONTHS } from '../lib/data';
import { NoSession } from '../lib/NoSession';

type Status = 'idle' | 'wallet' | 'processing' | 'declined';

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
  const repeatWeekly = booking.repeat === 'weekly';

  const rows: [string, string][] = [
    ['Tutor', tutor.name],
    ['Course', course],
    ['Date', dayObj.label],
    ['Time', `${slot} · ${lenLabel}`],
    ['Location', location],
    ...(repeatWeekly ? ([['Repeats', 'Weekly · same time']] as [string, string][]) : []),
  ];

  // Stripe-ish state machine: idle | wallet | processing | declined.
  const [status, setStatus] = useState<Status>('idle');
  const [card, setCard] = useState<'4242' | '0002'>('4242'); // 4242 approves · 0002 declines (Stripe test cards)
  const [wallet, setWallet] = useState<'apple' | 'google'>('apple');
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

  // Real payment + booking: hold a (simulated) PaymentIntent, then create the
  // booking through @noot/core and stash its id for B5. Errors surface via Alert
  // and reset to idle so the student can retry — never crash. Shared by the card
  // and wallet flows.
  const runPayment = async () => {
    setStatus('processing');
    // Reached via the dev launcher with no real draft -> keep the demo behavior.
    if (!booking.tutor) {
      setTimeout(() => router.push('/b5'), 1000);
      return;
    }
    try {
      const price = (rate * lengthMin) / 60;
      const amountCents = Math.round(price * 100);
      const { paymentIntentId } = await api.createPaymentIntent(amountCents);
      const sessionType: 'video' | 'in_person' = location.startsWith('Online') ? 'video' : 'in_person';
      const { bookingId } = await api.bookings.confirm({
        tutorId: booking.tutor.id,
        subject: course,
        scheduledAt: computeScheduledAt(),
        durationMinutes: lengthMin,
        sessionType,
        location,
        meetingLink: undefined,
        price,
        message: booking.message,
        paymentIntentId,
      });
      patchBooking({ bookingId });
      router.push('/b5');
    } catch (err) {
      setStatus('idle');
      Alert.alert('Payment failed', err instanceof Error ? err.message : 'Something went wrong — please try again.');
    }
  };

  // PaymentIntent confirm -> success routes to B5; the test-decline card fails
  // locally (never hits the network) so the declined UI state is preserved.
  const confirmPI = () => {
    if (card === '0002') {
      setStatus('processing');
      setTimeout(() => setStatus('declined'), 1200);
      return;
    }
    void runPayment();
  };
  const openWallet = (w: 'apple' | 'google') => {
    setWallet(w);
    setStatus('wallet');
  };
  const confirmWallet = () => {
    void runPayment();
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
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>Total{repeatWeekly ? ' · per session' : ''}</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.accent }}>${cost}</Text>
          </View>
          {repeatWeekly ? (
            <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 8, lineHeight: 16 }}>
              Weekly sessions are charged one at a time — this payment covers your first session only.
            </Text>
          ) : null}
        </Card>

        <Eyebrow style={{ color: t.text3, marginTop: 24, marginBottom: 12 }}>Payment</Eyebrow>
        <Card style={{ padding: 14 }}>
          {/* Apple/Google icons aren't in the ported icon set — text-only wallet buttons. */}
          <Pressable onPress={() => openWallet('apple')} style={styles.applePay}>
            <Text style={styles.applePayLabel}>Apple Pay</Text>
          </Pressable>
          <Pressable onPress={() => openWallet('google')} style={styles.googlePay}>
            <Text style={styles.googlePayLabel}>Google Pay</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={[styles.hairline, { backgroundColor: t.border }]} />
            <Text style={{ fontSize: 12, color: t.text3 }}>Or pay with card</Text>
            <View style={[styles.hairline, { backgroundColor: t.border }]} />
          </View>

          <View style={[styles.cardBox, { borderColor: t.borderStrong }]}>
            <View style={[styles.cardBoxRow, { borderBottomColor: t.border, borderBottomWidth: 1 }]}>
              <Ic name="card" size={18} color={t.text3} strokeWidth={1.7} />
              <Text style={{ flex: 1, fontSize: 15, color: t.text }}>
                {card === '0002' ? '4000 0000 0000 0002' : '4242 4242 4242 4242'}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: t.text3 }}>VISA</Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.cardBoxCell, { flex: 1, borderRightColor: t.border, borderRightWidth: 1 }]}>
                <Text style={{ fontSize: 15, color: t.text }}>08 / 27</Text>
              </View>
              <View style={[styles.cardBoxCell, { width: 76, borderRightColor: t.border, borderRightWidth: 1 }]}>
                <Text style={{ fontSize: 15, color: t.text }}>123</Text>
              </View>
              <View style={[styles.cardBoxCell, { width: 72 }]}>
                <Text style={{ fontSize: 15, color: t.text }}>35487</Text>
              </View>
            </View>
          </View>

          <View style={styles.testCardRow}>
            <Text style={{ fontSize: 11, color: t.text3 }}>Test card</Text>
            <Chip label="•••• 4242 approves" on={card === '4242'} onPress={() => setCard('4242')} />
            <Chip label="•••• 0002 declines" on={card === '0002'} onPress={() => setCard('0002')} />
          </View>

          <View style={styles.securedRow}>
            <Ic name="lock" size={12} color={t.text3} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, color: t.text3 }}>Secured by Stripe ·</Text>
            <Ic name="link" size={13} color={t.text3} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, color: t.text3 }}>Link</Text>
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

      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        {status === 'declined' ? (
          <View style={[styles.declinedBox, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
            <View style={{ marginTop: 1 }}>
              <Ic name="alert" size={18} color={t.accent} strokeWidth={1.9} />
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: t.text2, lineHeight: 18 }}>
              <Text style={{ color: t.accent, fontWeight: '700' }}>Your card was declined.</Text> No charge was made — try
              another card or a wallet.
            </Text>
          </View>
        ) : null}
        <Button label={status === 'declined' ? `Try again · $${cost}` : `Confirm & pay $${cost}`} full onPress={confirmPI} />
      </ActionBar>

      <Modal visible={status === 'wallet'} transparent animationType="slide" onRequestClose={() => setStatus('idle')}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setStatus('idle')} />
        <View style={[styles.sheetBody, { backgroundColor: t.bg }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>{wallet === 'apple' ? 'Apple Pay' : 'Google Pay'}</Text>
          <Card flat style={{ padding: 14, backgroundColor: t.surfaceAlt }}>
            <View style={[styles.rowBetween, { marginBottom: 10 }]}>
              <Text style={{ fontSize: 13, color: t.text3 }}>Card</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>•••• 4242</Text>
            </View>
            <View style={[styles.rowBetween, { marginBottom: 10 }]}>
              <Text style={{ fontSize: 13, color: t.text3 }}>Pay to</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>noot</Text>
            </View>
            <Divider style={{ marginVertical: 4 }} />
            <View style={styles.rowBetween}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>Total</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>${cost}</Text>
            </View>
          </Card>
          <Text style={{ fontSize: 12, color: t.text3, textAlign: 'center', marginTop: 12 }}>
            Double-click the side button to confirm on a real device.
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button
              label={`Pay $${cost} with ${wallet === 'apple' ? 'Apple Pay' : 'Google Pay'}`}
              kind="dark"
              full
              onPress={confirmWallet}
            />
          </View>
        </View>
      </Modal>

      {/* Processing overlay — TODO(anim): source used a spinning ring; ActivityIndicator stands in. */}
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
  applePay: { width: '100%', height: 48, borderRadius: 10, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  applePayLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  googlePay: { width: '100%', height: 48, marginTop: 8, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0', alignItems: 'center', justifyContent: 'center' },
  googlePayLabel: { color: '#3c4043', fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  hairline: { flex: 1, height: 1 },
  cardBox: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  cardBoxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 46 },
  cardBoxCell: { paddingHorizontal: 12, height: 46, justifyContent: 'center' },
  testCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  securedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  heldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingHorizontal: 2 },
  policyCard: { marginTop: 14, padding: 14 },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  policyBody: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  declinedBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 13, borderWidth: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetBody: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 18 },
});
