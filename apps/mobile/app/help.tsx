// Help & support — contact + a few FAQs. Keeps it simple: email us (mailto) and expandable
// FAQ items. No backend; content lives here until a real help center exists.
import React, { useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Eyebrow, Ic, useTheme } from '@noot/ui';
import { SUPPORT_EMAIL } from '../lib/legal';



const FAQ: [string, string][] = [
  ['How do payments work?', 'You pay when you book — the charge is held securely and only released to your tutor after the session is marked complete. Cancel 24h+ ahead for a full refund.'],
  ['How do I become a tutor?', 'Go to Profile → "Become a tutor". You’ll add the courses you aced (with your grades), set your rates, and upload an unofficial transcript for verification. Once approved you can receive bookings.'],
  ['When do tutors get paid?', 'After a session is marked complete, your payout is transferred to your connected Stripe account (set it up under Profile → Payout account). It typically lands within a couple business days.'],
  ['Is my info safe?', 'Transcripts are only seen by the noot team member who checks them, and are never shared publicly. Payments run through Stripe — we never store your card number.'],
  ['How do refunds work?', 'Cancel 24h+ before a session for a full refund, 50% within 2–24h, none under 2h. If a tutor no-shows you’re fully refunded.'],
];

export default function Help() {
  const t = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Screen>
      <NavTop title="Help & support" onBack={() => router.back()} />
      <Body pad={16}>
        <Card
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Noot%20support`)}
          style={styles.contact}
        >
          <View style={[styles.contactIcon, { backgroundColor: t.accent }]}>
            <Ic name="mail" size={20} color={t.onAccent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactTitle, { color: t.text }]}>Email support</Text>
            <Text style={[styles.contactSub, { color: t.text3 }]}>{SUPPORT_EMAIL} · we reply within a day</Text>
          </View>
          <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
        </Card>

        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>FAQ</Eyebrow>
        <View style={{ gap: 10 }}>
          {FAQ.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <Card key={q} onPress={() => setOpen(isOpen ? null : i)} style={{ padding: 14 }}>
                <View style={styles.qRow}>
                  <Text style={[styles.q, { color: t.text }]}>{q}</Text>
                  <Ic name={isOpen ? 'chevdown' : 'chevR'} size={16} color={t.text3} strokeWidth={2} />
                </View>
                {isOpen ? <Text style={[styles.a, { color: t.text2 }]}>{a}</Text> : null}
              </Card>
            );
          })}
        </View>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  contactIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { fontSize: 15, fontWeight: '600' },
  contactSub: { fontSize: 12.5, marginTop: 2 },
  qRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  q: { fontSize: 14.5, fontWeight: '600', flex: 1 },
  a: { fontSize: 13.5, lineHeight: 20, marginTop: 10 },
});
