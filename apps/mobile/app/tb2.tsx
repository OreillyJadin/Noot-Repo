// TB2 Session Detail (tutor) — ported from screens-tutorside.jsx (TB2).
// Student + session facts, earnings preview, message preview → chat, add-to-calendar
// (backend TODO), and a reschedule/cancel affordance. The prototype's <BottomSheet>
// doesn't exist in @noot/ui, so the "Need to reschedule or cancel?" sheet is built
// locally with RN's <Modal>, preserving the same copy and two choices.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Avatar, Divider, Eyebrow, Button, Ic, useTheme, type IconName } from '@noot/ui';
import { api } from '@noot/core';
import { useApp, type BookingDraft } from '../lib/store';
import { DAYS, toTutor, type Tutor } from '../lib/data';
import { NoSession } from '../lib/NoSession';
import { useCounterpart } from '../lib/useCounterpart';

const FEE_RATE = 0.175; // 15–20% platform fee; using 17.5% midpoint

function sessionFacts(booking: BookingDraft, tutor: Tutor) {
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1]!;
  const lengthMin = booking.lengthMin ?? 60;
  const lengthHours = lengthMin / 60;
  const lenLabel = lengthMin === 30 ? '30 min' : `${lengthHours} hr`;
  const slot = booking.slot ?? '3:00 PM';
  const location = booking.location ?? 'Gorgas Library, Fl 2';
  const course = booking.course ?? tutor.courses[0]![0];
  const courseMatch = tutor.courses.find((c) => c[0] === course) ?? tutor.courses[0]!;
  const rate = courseMatch[2];
  const gross = rate * lengthHours;
  const fee = gross * FEE_RATE;
  const payout = gross - fee;
  const online = location.startsWith('Online');
  return { dayObj, lengthHours, lenLabel, slot, location, course, rate, gross, fee, payout, online };
}

function FactRow({ ic, label, value }: { ic: IconName; label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.factRow}>
      <View style={[styles.factIcon, { backgroundColor: t.accentWeak }]}>
        <Ic name={ic} size={17} color={t.accent} strokeWidth={1.8} />
      </View>
      <Text style={[styles.factLabel, { color: t.text3 }]}>{label}</Text>
      <Text style={[styles.factValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

export default function TB2() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();
  // Session facts + earnings are derived from the booking draft (store). When the draft
  // is empty (e.g. deep-linked), fetch a real tutor for rate/course data instead of demo.
  const [fetchedTutor, setFetchedTutor] = useState<Tutor | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (booking.tutor) return; // draft already carries the tutor
    let active = true;
    api.tutors
      .search()
      .then((list) => { if (active && list[0]) setFetchedTutor(toTutor(list[0])); })
      .catch(() => { /* deep-linked with no draft → resolve a real tutor for rates */ });
    return () => { active = false; };
  }, [booking.tutor]);
  const student = useCounterpart(booking.studentId);
  const studentMeta = [student.year, student.major].filter(Boolean).join(' · ');
  const tutor = booking.tutor ?? fetchedTutor;
  if (!tutor) return <NoSession />;
  const f = sessionFacts(booking, tutor);

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Session details" />
      <Body pad={20}>
        {/* student */}
        <Card style={{ padding: 16 }}>
          <View style={styles.row}>
            <Avatar size={48} label={student.first[0]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>{student.name}</Text>
              {studentMeta ? <Text style={[styles.meta, { color: t.text3 }]}>{studentMeta}</Text> : null}
            </View>
            <View style={[styles.confirmedPill, { backgroundColor: t.goodWeak }]}>
              <Ic name="check" size={11} color={t.good} strokeWidth={3} />
              <Text style={[styles.confirmedLabel, { color: t.good }]}>Confirmed</Text>
            </View>
          </View>
        </Card>

        {/* facts */}
        <Card style={{ marginTop: 12, padding: 16 }}>
          <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>Session</Eyebrow>
          <View style={{ gap: 12 }}>
            <FactRow ic="cap" label="Course" value={f.course} />
            <FactRow ic="cal" label="Date" value={f.dayObj.label} />
            <FactRow ic="clock" label="Time" value={`${f.slot} · ${f.lenLabel}`} />
            <FactRow
              ic={f.online ? 'video' : 'pin'}
              label={f.online ? 'Virtual' : 'In person'}
              value={f.online ? 'Integrated video' : f.location}
            />
          </View>
        </Card>

        {/* student's message + focus */}
        <Card onPress={() => router.push('/chat_tutor')} style={{ marginTop: 12, padding: 16 }}>
          <View style={styles.msgHead}>
            <Eyebrow style={{ color: t.text3 }}>From {student.first}</Eyebrow>
            {booking.tag ? (
              <View style={[styles.tagPill, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
                <Text style={[styles.tagLabel, { color: t.accent }]}>{booking.tag}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.msgRow}>
            <Avatar size={32} label={student.first[0]} />
            <View style={[styles.bubble, { backgroundColor: t.surfaceAlt }]}>
              <Text style={{ fontSize: 14, lineHeight: 21, color: t.text }}>
                {booking.message || `Hey, I'm ${student.first}! Looking forward to working through ${f.course} with you.`}
              </Text>
            </View>
          </View>
          <View style={styles.tapRow}>
            <Ic name="chat" size={14} color={t.accent} strokeWidth={1.9} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.accent }}>Tap to open the full conversation</Text>
          </View>
        </Card>

        {/* earnings preview */}
        <Card style={{ marginTop: 12, padding: 16 }}>
          <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>Earnings preview</Eyebrow>
          <View style={styles.earnRow}>
            <Text style={{ fontSize: 14, color: t.text2 }}>{f.lenLabel} × ${f.rate}/hr</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>${f.gross.toFixed(2)}</Text>
          </View>
          <View style={[styles.earnRow, { marginTop: 10 }]}>
            <Text style={{ fontSize: 14, color: t.text2 }}>Noot service fee ({(FEE_RATE * 100).toFixed(1)}%)</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.text2 }}>−${f.fee.toFixed(2)}</Text>
          </View>
          <Divider style={{ marginVertical: 13 }} />
          <View style={styles.earnRow}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>You earn</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.good }}>${f.payout.toFixed(2)}</Text>
          </View>
          <View style={styles.lockRow}>
            <Ic name="lock" size={13} color={t.text3} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, color: t.text3 }}>Paid out to your Stripe account after the session.</Text>
          </View>
        </Card>

        {/* primary CTAs */}
        <View style={styles.ctaRow}>
          <Button
            label="Message"
            kind="secondary"
            size="md"
            iconRight="chat"
            style={{ flex: 1 }}
            onPress={() => router.push('/chat_tutor')}
          />
          <Button
            label="Add to calendar"
            kind="secondary"
            size="md"
            iconRight="cal"
            style={{ flex: 1 }}
            onPress={() => {
              // TODO(api): wire up real device-calendar integration.
              Alert.alert('Added to your calendar');
            }}
          />
        </View>

        {/* reschedule/cancel — small text link */}
        <Pressable onPress={() => setMoreOpen(true)} style={styles.moreWrap}>
          <Text style={[styles.moreLabel, { color: t.text3 }]}>Need to reschedule or cancel?</Text>
        </Pressable>

        <Card flat style={{ ...styles.reminder, backgroundColor: t.surfaceAlt }}>
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
              This booking is confirmed. Changing it affects {student.first} and may impact your reliability score.
            </Text>
          </Card>

          <Card
            onPress={() => {
              setMoreOpen(false);
              router.push('/xtr');
            }}
            style={{ padding: 14, marginBottom: 10 }}
          >
            <View style={styles.choiceRow}>
              <View style={[styles.choiceIcon, { backgroundColor: t.accentWeak }]}>
                <Ic name="cal" size={18} color={t.accent} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: t.text }]}>Propose a new time</Text>
                <Text style={[styles.choiceSub, { color: t.text3 }]}>{student.first} confirms the change</Text>
              </View>
              <Ic name="chevron" size={16} color={t.text3} strokeWidth={2} />
            </View>
          </Card>

          <Card
            onPress={() => {
              setMoreOpen(false);
              router.push('/xtc');
            }}
            style={{ padding: 14 }}
          >
            <View style={styles.choiceRow}>
              <View style={[styles.choiceIcon, { backgroundColor: t.surface2 }]}>
                <Ic name="x" size={18} color={t.text2} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: t.text }]}>Cancel session</Text>
                <Text style={[styles.choiceSub, { color: t.text3 }]}>{student.first} is refunded per policy</Text>
              </View>
              <Ic name="chevron" size={16} color={t.text3} strokeWidth={2} />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13 },
  confirmedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  confirmedLabel: { fontSize: 11, fontWeight: '700' },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  factLabel: { fontSize: 13, width: 64, flexShrink: 0 },
  factValue: { fontSize: 14, fontWeight: '600', textAlign: 'right', flex: 1 },
  msgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  tagLabel: { fontSize: 12, fontWeight: '700' },
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
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 15, fontWeight: '600' },
  choiceSub: { fontSize: 12, marginTop: 1 },
});
