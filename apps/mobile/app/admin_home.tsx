// Admin panel landing. Reached only from the gated Profile entry (roles.includes('admin')).
// This is NOT a role "mode" — it doesn't touch active_role and isn't in the role switcher.
// Phase 0 lands the shell + a defense-in-depth client guard; Phase 2 wires each section
// (tutor approvals, user management, booking oversight, review moderation) to admin-only
// Edge Functions that RE-VERIFY is_admin() server-side (client visibility is not a boundary).
import React from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Ic, Eyebrow, useTheme, type IconName } from '@noot/ui';
import { useMe } from '../lib/useMe';

const SECTIONS: [IconName, string, string][] = [
  ['cap', 'Tutor approvals', 'Review transcripts & approve tutors'],
  ['user', 'User management', 'View accounts, suspend or reactivate'],
  ['cal', 'Booking oversight', 'All bookings; flag & resolve disputes'],
  ['star', 'Review moderation', 'Approve or reject submitted reviews'],
];

export default function AdminHome() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');

  // Defense-in-depth: bounce a non-admin who deep-links here. Real enforcement is
  // server-side on every admin action; this is UI-only.
  if (!loading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  return (
    <Screen>
      <NavTop title="Noot Admin" onBack={() => router.back()} />
      <Body pad={20}>
        <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>Team tools</Eyebrow>
        <View style={{ gap: 10 }}>
          {SECTIONS.map(([icon, title, sub]) => (
            <Card key={title} onPress={() => Alert.alert(title, 'Built next (Phase 2).')} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: t.surface2 }]}>
                <Ic name={icon} size={18} color={t.accent} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]}>{title}</Text>
                <Text style={[styles.sub, { color: t.text3 }]}>{sub}</Text>
              </View>
              <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
            </Card>
          ))}
        </View>
        <Text style={[styles.note, { color: t.text3 }]}>
          Admin actions are verified server-side. This panel is visible only to admin accounts.
        </Text>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
  icon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 1 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 18, paddingHorizontal: 2 },
});
