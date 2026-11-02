// B5 — pending request confirmation by default, with the handshake reserved for tutor acceptance.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, H1, Ic, ListSection, ListRow, useTheme, type IconName } from '@noot/ui';
import { api, auth, type Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { formatSessionTime } from '../lib/formatSessionTime';
import { JoinVideoButton } from '../lib/JoinVideoButton';

export default function B5() {
  const { bookingId: rawBookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const bookingId = Array.isArray(rawBookingId) ? rawBookingId[0] : rawBookingId;
  return bookingId ? <ConfirmedMode bookingId={bookingId} /> : <RequestMode />;
}

function RequestMode() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();

  const tutorName = booking.tutor?.name ?? 'your tutor';
  const day = booking.scheduledAt ? formatSessionTime(booking.scheduledAt) : null;
  const lengthMin = booking.lengthMin ?? 60;
  const lengthLabel = lengthMin % 60 === 0 ? `${lengthMin / 60} hr` : `${lengthMin} min`;
  const location = booking.sessionType === 'video' ? 'Virtual' : booking.location ?? 'Gorgas Library, Fl 2';
  const course = booking.course ?? booking.tutor?.courses[0]?.[0] ?? 'Your course';
  const acceptBy = booking.acceptBy ? formatSessionTime(booking.acceptBy) : 'the acceptance deadline';
  const rows: [IconName, string][] = [
    ['cap', course],
    ['cal', day ?? `${booking.dayIndex ?? 'Session'} · ${booking.slot ?? '3:00 PM'}`],
    [booking.sessionType === 'video' ? 'video' : 'pin', location],
    ['clock', `${lengthLabel} session`],
  ];

  return (
    <Screen>
      <Body pad={24} contentStyle={{ paddingTop: insets.top + 24 }}>
        <View style={styles.hero}>
          <View style={[styles.pendingCircle, { backgroundColor: t.accentWeak }]}>
            <Ic name="clock" size={42} color={t.accent} strokeWidth={1.8} />
          </View>
          <H1 style={{ fontSize: 26, marginTop: 22, textAlign: 'center' }}>Session request sent</H1>
          <Text style={[styles.sub, { color: t.text2 }]}>
            <Text style={{ fontWeight: '700', color: t.text }}>{tutorName}</Text> has until {acceptBy} to accept.
            You won&apos;t be charged unless the session happens.
          </Text>
        </View>

        <View style={{ marginTop: 26 }}>
          <ListSection>
            {rows.map(([icon, value], i) => <ListRow key={i} icon={icon} title={value} titleLines={2} />)}
          </ListSection>
        </View>

        <Button
          label="View session"
          kind="secondary"
          size="md"
          full
          style={{ marginTop: 16 }}
          onPress={() => router.replace('/sessions')}
        />

        <View style={styles.noteRow}>
          <Ic name="lock" size={16} color={t.good} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 12, color: t.text2, lineHeight: 17 }}>
            If {tutorName} declines or doesn&apos;t respond in time, you won&apos;t be charged.
          </Text>
        </View>
        <View style={[styles.noteRow, { marginTop: 10 }]}>
          <Ic name="clock" size={16} color={t.text3} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 12, color: t.text2, lineHeight: 17 }}>
            We&apos;ll let you know when {tutorName} responds.
          </Text>
        </View>
      </Body>
      <ActionBar>
        <Button label="Done" full onPress={() => router.replace('/home')} />
      </ActionBar>
    </Screen>
  );
}

function ConfirmedMode({ bookingId }: { bookingId: string }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patchBooking } = useApp();
  const [session, setSession] = useState<{ booking: Booking; tutor: Tutor } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [booking, userId] = await Promise.all([
          api.bookings.get(bookingId),
          auth.getSessionUserId(),
        ]);
        if (!booking || booking.status !== 'confirmed' || booking.studentId !== userId) {
          if (active) router.replace('/sessions');
          return;
        }
        const summary = await api.tutors.getById(booking.tutorId).catch(() => null);
        if (!summary) {
          if (active) router.replace('/sessions');
          return;
        }
        if (active) setSession({ booking, tutor: toTutor(summary) });
      } catch {
        if (active) router.replace('/sessions');
      }
    })();
    return () => { active = false; };
  }, [bookingId, router]);

  if (!session) {
    return (
      <Screen>
        <Body pad={24} contentStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={t.accent} />
        </Body>
      </Screen>
    );
  }

  const { booking, tutor } = session;
  const location = booking.sessionType === 'video' ? 'Virtual' : booking.location ?? 'In person';
  const lengthLabel = booking.durationMinutes % 60 === 0
    ? `${booking.durationMinutes / 60} hr`
    : `${booking.durationMinutes} min`;
  const rows: [IconName, string][] = [
    ['cap', booking.subject],
    ['cal', formatSessionTime(booking.scheduledAt)],
    [booking.sessionType === 'video' ? 'video' : 'pin', location],
    ['clock', `${lengthLabel} session`],
  ];

  const openChat = () => {
    patchBooking({ tutor, bookingId: booking.id });
    router.push('/chat');
  };

  return (
    <Screen>
      <Body pad={24} contentStyle={{ paddingTop: insets.top + 24 }}>
        <View style={styles.hero}>
          <View style={styles.handshakeWrap}>
            <View style={[styles.ring, { borderColor: t.accent }]} />
            <View style={[styles.ring, { borderColor: t.accent }]} />
            <View style={[styles.handshakeCircle, { backgroundColor: t.accent }]}>
              <Ic name="handshake" size={50} color={t.onAccent} strokeWidth={1.9} />
            </View>
          </View>
          <H1 style={{ fontSize: 26, marginTop: 22, textAlign: 'center' }}>Deal locked in.</H1>
          <Text style={[styles.sub, { color: t.text2 }]}>
            <Text style={{ fontWeight: '700', color: t.text }}>{tutor.name}</Text> accepted your session.
          </Text>
        </View>

        <View style={{ marginTop: 26 }}>
          <ListSection>
            {rows.map(([icon, value], i) => <ListRow key={i} icon={icon} title={value} titleLines={2} />)}
          </ListSection>
        </View>

        {booking.sessionType === 'video' ? <JoinVideoButton bookingId={booking.id} /> : null}
        <View style={styles.actionRow}>
          <Button label="Message" kind="secondary" size="md" style={{ flex: 1 }} onPress={openChat} />
          <Button label="View session" kind="secondary" size="md" style={{ flex: 1 }} onPress={() => router.replace('/sessions')} />
        </View>
      </Body>
      <ActionBar>
        <Button label="Done" full onPress={() => router.replace('/home')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 24 },
  pendingCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  handshakeWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 60, borderWidth: 2, opacity: 0 },
  handshakeCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  sub: { marginTop: 8, maxWidth: 290, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
});
