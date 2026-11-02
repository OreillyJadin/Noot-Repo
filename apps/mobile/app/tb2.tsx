// TB2 Session Detail (tutor) — ported from screens-tutorside.jsx (TB2).
// Student + session facts, earnings preview, message preview → chat, add-to-calendar
// (backend TODO), and a reschedule/cancel affordance. The prototype's <BottomSheet>
// doesn't exist in @noot/ui, so the "Need to reschedule or cancel?" sheet is built
// locally with RN's <Modal>, preserving the same copy and two choices.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Avatar, Divider, Eyebrow, Button, Ic, ListSection, ListRow, StatusDot, useTheme } from '@noot/ui';
import { api, feeRateFor } from '@noot/core';
import { useMe } from '../lib/useMe';
import { useApp, type BookingDraft } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { NoSession } from '../lib/NoSession';
import { useCounterpart } from '../lib/useCounterpart';
import { formatSessionTime } from '../lib/formatSessionTime';


function sessionFacts(booking: BookingDraft, scheduledAt: string, tutor: Tutor, gradesVerified: boolean) {
  const [day, time] = formatSessionTime(scheduledAt).split(' · ');
  const lengthMin = booking.lengthMin ?? 60;
  const lengthHours = lengthMin / 60;
  const lenLabel = lengthMin === 30 ? '30 min' : `${lengthHours} hr`;
  const location = booking.location ?? '';
  const course = booking.course ?? '';
  const courseMatch = tutor.courses.find((c) => c[0] === course);
  // A real booking carries its own price and payout (a $0 admin booking, a rate or
  // verification changed since it was booked), so the rate and fee shown are derived from
  // those amounts. The tutor's current course rate is only the preview before one exists.
  const booked = booking.price != null;
  const previewRate = courseMatch?.[2] ?? 0;
  const previewFeeRate = feeRateFor(gradesVerified && !courseMatch?.[4]);
  const gross = booked ? booking.price! : previewRate * lengthHours;
  const payout = booking.tutorPayoutAmount ?? gross - gross * previewFeeRate;
  const fee = gross - payout;
  const feeRate = booked ? (gross > 0 ? fee / gross : 0) : previewFeeRate;
  const rate = booked ? gross / lengthHours : previewRate;
  const online = booking.sessionType === 'video';
  return { day: day!, time: time!, lengthHours, lenLabel, location, course, rate, feeRate, gross, fee, payout, online };
}

export default function TB2() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking, patchBooking } = useApp();
  // Session facts + earnings are derived from the booking draft (store). This is the
  // tutor's own screen, so when the draft doesn't carry a tutor, load the signed-in tutor's
  // own profile for the rates. (It used to take the first search result — always some other
  // tutor, since search excludes you — and show their rates as your earnings.)
  const [moreOpen, setMoreOpen] = useState(false);
  const { me, gradesVerified } = useMe();
  useEffect(() => {
    if (booking.tutor || !me) return; // draft already carries the tutor
    let active = true;
    api.tutors
      .getById(me.id)
      .then((own) => { if (active && own) patchBooking({ tutor: toTutor(own) }); })
      .catch(() => { /* offline → NoSession below */ });
    return () => { active = false; };
  }, [booking.tutor, me?.id, patchBooking]);
  const student = useCounterpart(booking.studentId);
  const studentMeta = [student.year, student.major].filter(Boolean).join(' · ');
  const studentProposed =
    !!booking.rescheduleProposedAt &&
    !!booking.rescheduleProposedBy &&
    booking.rescheduleProposedBy === booking.studentId;
  const ownProposalPending =
    !!booking.rescheduleProposedAt &&
    !!booking.rescheduleProposedBy &&
    booking.rescheduleProposedBy === me?.id;
  const tutor = booking.tutor;
  if (!tutor || !booking.scheduledAt) return <NoSession />;
  // Fee follows the course's verification status: 17.5% verified, 32.5% otherwise.
  const f = sessionFacts(booking, booking.scheduledAt, tutor, gradesVerified);

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Session details" />
      <Body pad={20}>
        {studentProposed && booking.rescheduleProposedAt ? (
          <Card style={{ marginBottom: 12, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>
                  {student.first} asked to move this to
                </Text>
                <Text style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>
                  {formatSessionTime(booking.rescheduleProposedAt)}
                </Text>
              </View>
              <Button label="Review" kind="tint" size="sm" onPress={() => router.push('/xsr')} />
            </View>
          </Card>
        ) : null}
        {/* student */}
        <Card style={{ padding: 16 }}>
          <View style={styles.row}>
            <Avatar size={48} label={student.first[0]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>{student.name}</Text>
              {studentMeta ? <Text style={[styles.meta, { color: t.text3 }]}>{studentMeta}</Text> : null}
            </View>
            <StatusDot label="Confirmed" color={t.good} />
          </View>
        </Card>

        {/* facts */}
        <View style={{ marginTop: 12 }}>
          <ListSection label="Session">
            <ListRow
              icon="cap"
              title="Course"
              trailing={<Text numberOfLines={2} style={[styles.factValue, { color: t.text }]}>{f.course}</Text>}
              accessibilityLabel={`Course: ${f.course}`}
              chevron={false}
            />
            <ListRow
              icon="cal"
              title="Date"
              trailing={<Text numberOfLines={2} style={[styles.factValue, { color: t.text }]}>{f.day}</Text>}
              accessibilityLabel={`Date: ${f.day}`}
              chevron={false}
            />
            <ListRow
              icon="clock"
              title="Time"
              trailing={<Text numberOfLines={2} style={[styles.factValue, { color: t.text }]}>{f.time} · {f.lenLabel}</Text>}
              accessibilityLabel={`Time: ${f.time} · ${f.lenLabel}`}
              chevron={false}
            />
            <ListRow
              icon={f.online ? 'video' : 'pin'}
              title={f.online ? 'Virtual' : 'In person'}
              trailing={<Text numberOfLines={2} style={[styles.factValue, { color: t.text }]}>{f.online ? 'Integrated video' : f.location || 'Location not set'}</Text>}
              accessibilityLabel={`${f.online ? 'Virtual' : 'In person'}: ${f.online ? 'Integrated video' : f.location || 'Location not set'}`}
              chevron={false}
            />
          </ListSection>
        </View>

        {/* student's message + focus */}
        {booking.requestNote?.trim() ? (
          <Card onPress={() => router.push('/chat_tutor')} style={{ marginTop: 12, padding: 16 }}>
            <View style={styles.msgHead}>
              <Eyebrow style={{ color: t.text3 }}>From {student.first}</Eyebrow>
            </View>
            <View style={styles.msgRow}>
              <Avatar size={32} label={student.first[0]} />
              <View style={[styles.bubble, { backgroundColor: t.surfaceAlt }]}>
                <Text style={{ fontSize: 14, lineHeight: 21, color: t.text }}>{booking.requestNote}</Text>
              </View>
            </View>
            <View style={styles.tapRow}>
              <Ic name="chat" size={14} color={t.accent} strokeWidth={1.9} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.accent }}>Tap to open the full conversation</Text>
            </View>
          </Card>
        ) : null}

        {/* earnings preview */}
        <Card style={{ marginTop: 12, padding: 16 }}>
          <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>Earnings preview</Eyebrow>
          <View style={styles.earnRow}>
            <Text style={{ fontSize: 14, color: t.text2 }}>{f.gross === 0 ? `${f.lenLabel} · admin booking` : `${f.lenLabel} × $${f.rate.toFixed(2).replace(/\.00$/, '')}/hr`}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>${f.gross.toFixed(2)}</Text>
          </View>
          <View style={[styles.earnRow, { marginTop: 10 }]}>
            <Text style={{ fontSize: 14, color: t.text2 }}>Noot service fee ({+(f.feeRate * 100).toFixed(1)}%)</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text2 }}>−${f.fee.toFixed(2)}</Text>
          </View>
          <Divider style={{ marginVertical: 13 }} />
          <View style={styles.earnRow}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>You earn</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.good }}>${f.payout.toFixed(2)}</Text>
          </View>
          <View style={styles.lockRow}>
            <Ic name="lock" size={13} color={t.text3} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, color: t.text3 }}>
              {f.gross === 0 ? 'Admin booking — nothing is charged and there is no payout for this session.' : 'Paid out to your Stripe account after the session.'}
            </Text>
          </View>
        </Card>

        {/* primary CTA. "Add to calendar" was removed: it only showed a success alert,
            with no expo-calendar integration behind it (APP_REVIEW_TICKETS.md T21). */}
        <View style={styles.ctaRow}>
          <Button
            label="Message"
            kind="secondary"
            size="md"
            iconRight="chat"
            style={{ flex: 1 }}
            onPress={() => router.push('/chat_tutor')}
          />
        </View>

        {/* reschedule/cancel — small text link */}
        <Pressable onPress={() => setMoreOpen(true)} style={styles.moreWrap}>
          <Text style={[styles.moreLabel, { color: t.text3 }]}>Need to reschedule or cancel?</Text>
        </Pressable>

        <Card style={styles.reminder}>
          <View style={{ marginTop: 1 }}>
            <Ic name="clock" size={16} color={t.text3} strokeWidth={1.8} />
          </View>
          <Text style={{ flex: 1, fontSize: 12, color: t.text2, lineHeight: 17 }}>
            We&apos;ll remind you both <Text style={{ color: t.text, fontWeight: '700' }}>24 hours</Text> and{' '}
            <Text style={{ color: t.text, fontWeight: '700' }}>1 hour</Text> before. The{' '}
            {f.online ? 'video link' : 'location'} is included in the 1-hour reminder.
          </Text>
        </Card>
      </Body>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMoreOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>Reschedule or cancel</Text>
            <Pressable onPress={() => setMoreOpen(false)} hitSlop={8}>
              <Ic name="x" size={20} color={t.text3} strokeWidth={2} />
            </Pressable>
          </View>

          <Card flat style={{ padding: 14, backgroundColor: t.surfaceAlt, marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: t.text2, lineHeight: 19 }}>
              This booking is confirmed. Changing it affects {student.first}. Cancellations are recorded for admin review.
            </Text>
          </Card>

          <ListSection>
            <ListRow
              icon="cal"
              title="Propose a new time"
              subtitle={ownProposalPending ? `Waiting on ${student.first}` : `${student.first} confirms the change`}
              muted={ownProposalPending}
              chevron={!ownProposalPending}
              onPress={ownProposalPending ? undefined : () => {
                setMoreOpen(false);
                router.push('/xtr');
              }}
            />
            <ListRow
              icon="x"
              title="Cancel session"
              subtitle={`${student.first} is refunded per policy`}
              onPress={() => {
                setMoreOpen(false);
                router.push('/xtc');
              }}
            />
          </ListSection>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13 },
  factValue: { flexShrink: 1, maxWidth: '55%', textAlign: 'right', fontSize: 13, fontWeight: '600' },
  msgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  msgRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bubble: { flex: 1, paddingHorizontal: 13, paddingVertical: 11, borderTopLeftRadius: 4, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  tapRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  earnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  moreWrap: { alignItems: 'center', marginTop: 18 },
  moreLabel: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  reminder: { marginTop: 18, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
});
