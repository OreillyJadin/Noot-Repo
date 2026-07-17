// S6 My Profile (student) — ported from screens-tabs.jsx (ProfileTab, role-locked as
// ProfileTabStudent). Backend-only actions (the prototype's showToast) become a
// TODO(api)'d Alert; "Dark mode" is a local visual toggle only (not wired to the real
// theme yet — that lives in ThemeProvider at the app root).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Toggle, Ic, H1, H2, Eyebrow, TabBar, RoleSwitcher, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe, fullName, firstName } from '../lib/useMe';
import { useRoleSwitch } from '../lib/useRoleSwitch';
import { useThemePref } from '../lib/themePref';
import { useTabNav } from '../lib/useTabNav';

// TODO(api): backend-only actions from the prototype's showToast() — swap for real
// navigation/mutations once wired up.
function notify(label: string) {
  Alert.alert(label, 'Built with backend — coming soon.');
}

function Row({
  icon,
  label,
  sub,
  value,
  onPress,
  danger,
  last,
  control,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
  control?: React.ReactNode;
}) {
  const t = useTheme();
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: t.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? t.accentWeak : t.surface2 }]}>
        <Ic name={icon} size={17} color={danger ? t.accent : t.text2} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowLabel, { color: danger ? t.accent : t.text }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: t.text3 }]}>{sub}</Text> : null}
      </View>
      {control}
      {value ? <Text style={[styles.rowValue, { color: t.text3 }]}>{value}</Text> : null}
      {onPress && !control ? <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} /> : null}
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useApp();
  const { me, loading } = useMe();
  const { dark, toggle: toggleDark, school, toggleSchool } = useThemePref();

  const displayName = fullName(me, 'Student');
  const displayFirst = firstName(me, 'Student');

  // Real study stats + saved-tutor count.
  const [stats, setStats] = useState<{ sessionsCompleted: number; hoursLearned: number } | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    api.studentStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    api.tutors.listSaved().then((l) => { if (active) setSavedCount(l.length); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const STATS: [string, string][] = [
    [stats ? String(stats.sessionsCompleted) : '—', 'Sessions'],
    [stats ? String(Math.round(stats.hoursLearned)) : '—', 'Hours'],
    [savedCount != null ? String(savedCount) : '—', 'Saved'],
  ];
  const coursesSub = me?.courses?.length ? me.courses.join(', ') : 'Add the courses you’re taking';

  const { roles, isAdmin, switchTo } = useRoleSwitch();
  const becomeAmbassador = async () => {
    try {
      await api.profile.addRole('ambassador');
      await switchTo('ambassador');
    } catch {
      notify('Could not add role');
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
        <View style={styles.headerRow}>
          <H1 style={styles.headerTitle}>Profile</H1>
          <Pressable onPress={() => notify('Settings')} style={[styles.gearBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ic name="gear" size={19} color={t.text2} strokeWidth={1.7} />
          </Pressable>
        </View>
      </View>
      <Body ref={scrollRef} pad={20} contentStyle={{ paddingTop: 10 }}>
        {/* identity card */}
        <Card style={{ padding: 18 }}>
          <View style={styles.identityRow}>
            <View style={{ position: 'relative' }}>
              <Avatar size={64} label={displayFirst[0]} />
              <Pressable
                onPress={() => notify('Change photo')}
                style={[styles.editBadge, { backgroundColor: t.accent, borderColor: t.surface }]}
              >
                <Ic name="edit" size={11} color={t.onAccent} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {loading ? <Skeleton width={160} height={22} /> : <H2 style={styles.name}>{displayName}</H2>}
              <Text style={[styles.sub, { color: t.text3 }]}>
                {me?.year ?? '—'} · {me?.major ?? '—'}
              </Text>
              <View style={styles.verifiedRow}>
                <Ic name="shield" size={13} color={t.good} strokeWidth={1.9} />
                <Text style={[styles.verifiedText, { color: t.good }]}>.edu verified</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statsRow, { borderTopColor: t.border }]}>
            {STATS.map(([n, l], i) => (
              <View key={l} style={[styles.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: t.border }]}>
                <Text style={[styles.statNum, { color: t.text }]}>{n}</Text>
                <Text style={[styles.statLabel, { color: t.text3 }]}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* mode switcher — only shows if the user holds 2+ switchable roles */}
        {roles.length > 1 ? (
          <View style={{ marginTop: 16 }}>
            <RoleSwitcher roles={roles} active={role} onSelect={switchTo} />
          </View>
        ) : null}

        {/* referral CTA — the program isn't built yet, so no fabricated credit balance */}
        <Card onPress={() => notify('Referrals')} style={{ ...styles.promo, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
          <View style={[styles.promoIcon, { backgroundColor: t.accent }]}>
            <Ic name="gift" size={20} color={t.onAccent} strokeWidth={1.7} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.promoTitle, { color: t.text }]}>Refer &amp; earn</Text>
            <Text style={[styles.promoSub, { color: t.text2 }]}>Become an ambassador to earn $5 for every classmate who completes their first paid session</Text>
          </View>
          <Ic name="chevR" size={17} color={t.accent} strokeWidth={2} />
        </Card>

        {/* account */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>Account</Eyebrow>
        <Card style={styles.cardNoPad}>
          <Row icon="user" label="Personal info" sub={me?.email ?? '—'} onPress={() => router.push('/edit_personal')} />
          <Row icon="cap" label="My courses" sub={coursesSub} onPress={() => router.push('/edit_courses')} />
          <Row icon="card" label="Payment methods" sub="No card on file" onPress={() => notify('Payment methods')} />
          <Row icon="doc" label="Booking & payment history" onPress={() => notify('History')} last />
        </Card>

        {/* preferences */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>Preferences</Eyebrow>
        <Card style={styles.cardNoPad}>
          <Row icon="bell" label="Notifications" sub="Reminders, messages, offers" onPress={() => notify('Notification settings')} />
          <Row icon="gear" label="Dark mode" control={<Toggle on={dark} onPress={toggleDark} />} />
          <Row icon="flame" label="School colors" sub="University of Alabama — crimson" control={<Toggle on={school} onPress={toggleSchool} />} />
          <Row icon="help" label="Help & support" onPress={() => notify('Help center')} last />
        </Card>

        {/* add roles you don't hold yet */}
        {!roles.includes('tutor') ? (
          <Card onPress={() => router.push('/t1')} style={styles.switchCard}>
            <View style={[styles.switchIcon, { backgroundColor: t.surface2 }]}>
              <Ic name="cap" size={21} color={t.accent} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: t.text }]}>Become a tutor</Text>
              <Text style={[styles.switchSub, { color: t.text3 }]}>Earn money helping classmates in courses you aced</Text>
            </View>
            <Ic name="chevR" size={18} color={t.text3} strokeWidth={2} />
          </Card>
        ) : null}
        {!roles.includes('ambassador') ? (
          <Card onPress={becomeAmbassador} style={styles.switchCard}>
            <View style={[styles.switchIcon, { backgroundColor: t.surface2 }]}>
              <Ic name="gift" size={21} color={t.accent} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: t.text }]}>Become an ambassador</Text>
              <Text style={[styles.switchSub, { color: t.text3 }]}>Share your code and earn $5 when a classmate completes their first paid session</Text>
            </View>
            <Ic name="chevR" size={18} color={t.text3} strokeWidth={2} />
          </Card>
        ) : null}

        {/* admin — gated, only for Noot-team accounts; NOT part of the role switcher */}
        {isAdmin ? (
          <Card onPress={() => router.push('/admin_home')} style={styles.switchCard}>
            <View style={[styles.switchIcon, { backgroundColor: t.surface2 }]}>
              <Ic name="shield" size={21} color={t.accent} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: t.text }]}>Noot Admin</Text>
              <Text style={[styles.switchSub, { color: t.text3 }]}>Team tools — approvals, users, disputes</Text>
            </View>
            <Ic name="chevR" size={18} color={t.text3} strokeWidth={2} />
          </Card>
        ) : null}

        {/* sign out */}
        <View style={{ marginTop: 4 }}>
          <Card style={styles.cardNoPad}>
            <Row icon="logout" label="Sign out" danger onPress={() => router.replace('/')} last />
          </Card>
        </View>
        <Text style={[styles.footer, { color: t.text3 }]}>noot · v1.0 · Peer tutoring for campus</Text>
      </Body>
      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexShrink: 0, paddingHorizontal: 20, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 28 },
  gearBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 19 },
  sub: { fontSize: 13, marginTop: 2 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  verifiedText: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 1 },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1 },
  promoIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  promoTitle: { fontSize: 14, fontWeight: '700' },
  promoSub: { fontSize: 12, marginTop: 1 },
  cardNoPad: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 13 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowValue: { fontSize: 14 },
  switchCard: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16 },
  switchIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  switchTitle: { fontSize: 15, fontWeight: '700' },
  switchSub: { fontSize: 12, marginTop: 1 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 18 },
});
