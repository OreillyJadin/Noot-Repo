// Booking / earnings history — past sessions for the signed-in user via api.listPast().
// Student view: "Booking & payment history" (what they paid). Tutor view: "Earnings &
// payment history" (their payout). Role-aware from useApp().
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Avatar, Badge, Button, EmptyState, Skeleton, useTheme, type BadgeTone } from '@noot/ui';
import { formatCampusDate, api, studentPaidAmount, tutorEarnedAmount, type Booking, type StudentPayment } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor } from '../lib/data';
import { draftFromBooking } from '../lib/bookingDraft';
import { canRateBooking, isRatedBooking, type RatedLookup } from '../lib/rating';

function whenLabel(iso: string): string {
  return formatCampusDate(iso, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: 'good',
  confirmed: 'accentSoft',
  cancelled: 'neutral',
  no_show: 'neutral',
  pending: 'neutral',
};

export default function History() {
  const t = useTheme();
  const router = useRouter();
  const { role, patchBooking } = useApp();
  const isTutor = role === 'tutor';

  const [rows, setRows] = useState<Booking[] | null>(null);
  const [names, setNames] = useState<Record<string, { firstName: string; lastName: string }>>({});
  const [ratedLookup, setRatedLookup] = useState<RatedLookup | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.listPast(isTutor ? 'tutor' : 'student'),
      api.resolveParticipantNames().catch(() => ({} as Record<string, { firstName: string; lastName: string }>)),
    ])
      .then(([past, nm]) => { if (active) { setRows(past); setNames(nm); } })
      .catch(() => { if (active) setRows([]); })
      .finally(() => {});
    return () => { active = false; };
  }, [isTutor]);

  useFocusEffect(useCallback(() => {
    if (isTutor || rows === null) return;
    let active = true;
    setRatedLookup(null);
    const bookingIds = rows.filter((b) => b.status === 'completed').map((b) => b.id);
    api.reviews
      .listRatedBookingIds(bookingIds)
      .then((ids) => {
        if (active) setRatedLookup({ checked: new Set(bookingIds), rated: new Set(ids) });
      })
      .catch(() => { if (active) setRatedLookup(null); });
    return () => { active = false; };
  }, [isTutor, rows]));

  const rateSession = async (b: Booking) => {
    if (opening) return;
    setOpening(true);
    try {
      const summary = await api.tutors.getById(b.tutorId);
      if (!summary) {
        Alert.alert('Couldn’t open rating', 'Please try again.');
        return;
      }
      patchBooking({ ...draftFromBooking(b), tutor: toTutor(summary) });
      router.push('/c2');
    } catch {
      Alert.alert('Couldn’t open rating', 'Please try again.');
    } finally {
      setOpening(false);
    }
  };

  const title = isTutor ? 'Earnings & payment history' : 'Booking & payment history';

  return (
    <Screen>
      <NavTop title={title} onBack={() => router.back()} />
      <Body pad={16}>
        {rows === null ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={78} radius={14} />
            <Skeleton height={78} radius={14} />
            <Skeleton height={78} radius={14} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState icon="doc" title="Nothing here yet" subtitle={isTutor ? 'Your completed sessions and payouts will show up here.' : 'Your past sessions and payments will show up here.'} />
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((b) => {
              const otherId = isTutor ? b.studentId : b.tutorId;
              const nm = names[otherId];
              const name = (nm ? `${nm.firstName} ${nm.lastName}`.trim() : '') || (isTutor ? 'Student' : 'Tutor');
              // Tutor earnings and the student's payment are both net of refunds.
              const paid = isTutor ? null : studentPaidAmount(b);
              const amount = isTutor ? tutorEarnedAmount(b) : (paid?.net ?? 0);
              const refunded = b.refundStatus === 'refunded';
              const refundNote = paid ? studentRefundNote(paid) : null;
              return (
                <Card key={b.id} style={styles.row}>
                  <Avatar size={42} label={name.charAt(0) || '?'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.top}>
                      <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>{name}</Text>
                      <View style={styles.amountWrap}>
                        {paid && paid.refundedToCard > 0 ? (
                          <Text style={[styles.original, { color: t.text3 }]} accessibilityLabel={`Originally $${paid.charged.toFixed(2)}`}>${paid.charged.toFixed(2)}</Text>
                        ) : null}
                        <Text style={[styles.amount, { color: isTutor && b.status === 'completed' ? t.good : t.text }]}>
                          {isTutor && amount > 0 ? '+' : ''}${Number(amount).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.meta, { color: t.text3 }]} numberOfLines={1}>
                      {b.subject} · {whenLabel(b.scheduledAt)}
                    </Text>
                    {refundNote ? (
                      <Text style={[styles.meta, { color: t.text3 }]}>{refundNote}</Text>
                    ) : null}
                    <View style={styles.badges}>
                      <Badge label={b.status === 'no_show' ? 'No-show' : b.status.charAt(0).toUpperCase() + b.status.slice(1)} tone={STATUS_TONE[b.status] ?? 'neutral'} />
                      {refunded ? <Badge label="Refunded" tone="accentSoft" /> : null}
                      {!isTutor && isRatedBooking(b, ratedLookup) ? <Badge label="Rated" tone="good" /> : null}
                    </View>
                    {!isTutor && canRateBooking(b, ratedLookup) ? (
                      <Button
                        label="Rate session"
                        kind="tint"
                        size="sm"
                        disabled={opening}
                        style={{ alignSelf: 'flex-start', marginTop: 8 }}
                        onPress={() => void rateSession(b)}
                      />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Body>
    </Screen>
  );
}

function studentRefundNote(paid: StudentPayment): string | null {
  const parts: string[] = [];
  if (paid.refundedToCard > 0) parts.push(`$${paid.refundedToCard.toFixed(2)} refunded to your card`);
  if (paid.creditReturned > 0) parts.push(`$${paid.creditReturned.toFixed(2)} back as Noot credit`);
  return parts.length ? parts.join(' · ') : null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  amountWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0 },
  original: { fontSize: 13, textDecorationLine: 'line-through' },
  amount: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});
