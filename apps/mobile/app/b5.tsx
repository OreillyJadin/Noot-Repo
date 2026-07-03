// B5 Booking Confirmed — ported from screens-booking2.jsx (B5). The "handshake"
// moment + a recap card + quick actions. Reads the booking draft from useApp()
// with safe fallbacks so nothing renders undefined. "Done" returns to the home tab.
import React from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, H1, Ic, useTheme, type IconName } from '@noot/ui';
import { useApp } from '../lib/store';
import { TUTORS, DAYS } from '../lib/data';

export default function B5() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking } = useApp();

  // Fall back to sane defaults — never render undefined if the draft is empty.
  const tutor = booking.tutor ?? TUTORS[0]!;
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) ?? DAYS[1] ?? DAYS[0]!;
  const lengthMin = booking.lengthMin ?? 60;
  const lenLabel = lengthMin === 30 ? '30 min' : `${lengthMin / 60} hr`;
  const slot = booking.slot ?? '3:00 PM';
  const location = booking.location ?? 'Gorgas Library, Fl 2';
  const course = booking.course ?? tutor.courses[0]![0];
  const dayWord = dayObj.label === 'Today' ? 'today' : dayObj.label === 'Tomorrow' ? 'tomorrow' : dayObj.label;

  const rows: [IconName, string][] = [
    ['cap', course],
    ['cal', `${dayObj.label} · ${slot}`],
    [location.startsWith('Online') ? 'video' : 'pin', location],
    ['clock', `${lenLabel} session`],
    ...(booking.repeat === 'weekly' ? ([['repeat', 'Repeats weekly — skip or cancel anytime']] as [IconName, string][]) : []),
  ];

  // TODO(api): chat.tsx isn't ported yet — this still follows the nav contract (go('chat')).
  const openChat = () => router.push('/chat');
  // TODO(api): showToast('Added to your calendar') in the prototype was a backend/device action.
  const addToCalendar = () => Alert.alert('Added to your calendar');

  return (
    <Screen>
      <Body pad={24} contentStyle={{ paddingTop: insets.top + 24 }}>
        <View style={styles.hero}>
          {/* TODO(anim): source pulses two rings + pops this circle in on arrival. */}
          <View style={styles.handshakeWrap}>
            <View style={[styles.ring, { borderColor: t.accent }]} />
            <View style={[styles.ring, { borderColor: t.accent }]} />
            <View style={[styles.handshakeCircle, { backgroundColor: t.accent }]}>
              <Ic name="handshake" size={50} color={t.onAccent} strokeWidth={1.9} />
            </View>
          </View>
          <H1 style={{ fontSize: 26, marginTop: 22, textAlign: 'center' }}>Deal locked in.</H1>
          <Text style={[styles.sub, { color: t.text2 }]}>
            You&apos;re set with <Text style={{ fontWeight: '700', color: t.text }}>{tutor.name}</Text> {dayWord}. We&apos;ve
            emailed the details to you both.
          </Text>
        </View>

        <Card style={{ marginTop: 26, padding: 16 }}>
          <View style={{ gap: 12 }}>
            {rows.map(([ic, v], i) => (
              <View key={i} style={styles.recapRow}>
                <View style={[styles.recapIcon, { backgroundColor: t.accentWeak }]}>
                  <Ic name={ic} size={17} color={t.accent} strokeWidth={1.8} />
                </View>
                <Text style={{ fontSize: 15, color: t.text, fontWeight: '500' }}>{v}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.actionRow}>
          <Button label="Message" kind="secondary" size="md" style={{ flex: 1 }} onPress={openChat} />
          <Button label="Add to calendar" kind="secondary" size="md" style={{ flex: 1 }} onPress={addToCalendar} />
        </View>

        <Card flat style={{ ...styles.noteCard, backgroundColor: t.surfaceAlt }}>
          <Ic name="lock" size={16} color={t.good} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 12, color: t.text2, lineHeight: 17 }}>Payment held — released after your session.</Text>
        </Card>
        <Card flat style={{ ...styles.noteCard, backgroundColor: t.surfaceAlt, marginTop: 10 }}>
          <Ic name="clock" size={16} color={t.text3} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 12, color: t.text2, lineHeight: 17 }}>
            We&apos;ll remind you both 24 hours and 1 hour before.
          </Text>
        </Card>
      </Body>

      <ActionBar>
        <Button label="Done" full onPress={() => router.replace('/home')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 24 },
  handshakeWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 60, borderWidth: 2, opacity: 0 },
  handshakeCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  sub: { marginTop: 8, maxWidth: 260, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recapIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 14 },
});
