// TP Tutor Profile — ported from screens-tabs.jsx (ProfileTab, role-locked as
// ProfileTabTutor). Every row here now leads to a real screen or mutation; the old
// stub-Alert helper is gone (APP_REVIEW_TICKETS.md T12). "Dark mode" is a local visual
// toggle only (not wired to the real theme yet — that lives in ThemeProvider at the app root).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Toggle, Ic, H1, H2, Eyebrow, TabBar, RoleSwitcher, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe, fullName, firstName } from '../lib/useMe';
import { useThemePref } from '../lib/themePref';
import { useTabNav } from '../lib/useTabNav';
import { useRoleSwitch } from '../lib/useRoleSwitch';
import { TutorStatusBanner } from '../lib/TutorStatusBanner';
import { pickAndUploadAvatar } from '../lib/avatar';
import * as WebBrowser from 'expo-web-browser';

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

export default function TutorProfile() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useApp();
  const { me, loading, tutorStatus } = useMe();
  const { dark, toggle: toggleDark, school, toggleSchool } = useThemePref();

  const meName = fullName(me, 'Tutor');
  const meFirst = firstName(me, 'T');

  // Local mirror of the avatar so an upload reflects immediately without a full refetch.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => { setAvatarUrl(me?.avatarUrl ?? null); }, [me?.avatarUrl]);
  const changePhoto = async () => {
    const url = await pickAndUploadAvatar();
    if (url) setAvatarUrl(url);
  };
  const meYearMajor = [me?.year, me?.major].filter(Boolean).join(' · ') || '—';

  // Stripe Connect (payout) status → drives the "Payout account" row + earnings promo.
  const [payouts, setPayouts] = useState<{ connected: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean } | null>(null);
  const refreshPayouts = () => api.connect.status().then((s) => setPayouts(s)).catch(() => {});
  useEffect(() => { void refreshPayouts(); }, []);
  const payoutSub = payouts?.payoutsEnabled
    ? 'Connected · payouts enabled'
    : payouts?.connected
      ? 'Setup incomplete — finish onboarding'
      : 'Not connected — set up Stripe';
  const setupPayouts = async () => {
    try {
      const { url } = await api.connect.onboardingLink();
      if (!url) {
        Alert.alert(
          'Payout setup unavailable',
          'We could not start Stripe payout setup just now. Please try again in a few minutes.',
        );
        return;
      }
      await WebBrowser.openAuthSessionAsync(url, 'noot://connect-return');
      void refreshPayouts();
    } catch {
      Alert.alert('Could not open payout setup', 'Please try again.');
    }
  };

  // Live teaching stats + the tutor's own courses (for the "Courses & rates" row).
  const [stats, setStats] = useState<{ sessionsTaught: number; hoursTaught: number; earnedTotal: number; avgRating: number | null; cancelledCount: number } | null>(null);
  const [coursesSub, setCoursesSub] = useState('Set your rates per course');
  useEffect(() => {
    let active = true;
    api.tutorStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    if (me) {
      api.tutors.getById(me.id).then((sum) => {
        if (!active || !sum || sum.courses.length === 0) return;
        setCoursesSub(sum.courses.map((c) => `${c.courseCode} · $${c.hourlyRate}/hr`).join(', '));
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [me]);

  // Ratings are collected but never surfaced in the app — no "Avg rating" stat here.
  const STATS: [string, string][] = [
    [stats ? String(stats.sessionsTaught) : '—', 'Sessions taught'],
    [stats ? String(Math.round(stats.hoursTaught)) : '—', 'Hours'],
  ];

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  const { roles, previewRoles, isAdmin, switchTo } = useRoleSwitch();
  // Reachable BEFORE the application is finished — that was the "can only access their tutor
  // profile after completing the tutor application" report. Keyed on approval, not the role.
  const previewing = tutorStatus !== 'approved';
  const becomeAmbassador = async () => {
    try {
      await api.profile.addRole('ambassador');
      await switchTo('ambassador');
    } catch {
      Alert.alert('Could not join the ambassador program', 'Please try again in a moment.');
    }
  };

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
        <View style={styles.headerRow}>
          <H1 style={styles.headerTitle}>Profile</H1>
        </View>
      </View>
      <Body ref={scrollRef} pad={20} contentStyle={{ paddingTop: 10 }}>
        {/* identity card */}
        <Card style={{ padding: 18 }}>
          <View style={styles.identityRow}>
            <View style={{ position: 'relative' }}>
              <Avatar size={64} label={meFirst[0]} uri={avatarUrl} />
              <Pressable
                onPress={changePhoto}
                style={[styles.editBadge, { backgroundColor: t.accent, borderColor: t.surface }]}
              >
                <Ic name="edit" size={11} color={t.onAccent} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {loading ? <Skeleton width={160} height={22} /> : <H2 style={styles.name}>{meName}</H2>}
              <Text style={[styles.sub, { color: t.text3 }]}>
                {meYearMajor}
              </Text>
              <View style={styles.verifiedRow}>
                <Ic name="shield" size={13} color={t.good} strokeWidth={1.9} />
                <Text style={[styles.verifiedText, { color: t.good }]}>Verified tutor</Text>
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

        {previewing ? (
          <View style={{ marginTop: 4 }}>
            <TutorStatusBanner status={tutorStatus} onApply={() => router.push('/t1')} />
          </View>
        ) : null}

        {/* mode switcher — every mode, with the ones you haven't joined marked as preview */}
        {roles.length + previewRoles.length > 1 ? (
          <View style={{ marginTop: 16 }}>
            <RoleSwitcher roles={roles} previewRoles={previewRoles} active={role} onSelect={switchTo} />
          </View>
        ) : null}

        {/* earnings summary — real total from completed bookings (payouts still simulated) */}
        <Card onPress={setupPayouts} style={{ ...styles.promo, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
          <View style={[styles.promoIcon, { backgroundColor: t.accent }]}>
            <Ic name="dollar" size={20} color={t.onAccent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.promoTitle, { color: t.text }]}>
              {stats ? `$${stats.earnedTotal.toFixed(2)} earned` : 'Earnings'}
            </Text>
            <Text style={[styles.promoSub, { color: t.text2 }]}>
              {payouts?.payoutsEnabled ? 'Payouts enabled — you’re all set' : 'Connect Stripe to start receiving payouts'}
            </Text>
          </View>
          <Ic name="chevR" size={17} color={t.accent} strokeWidth={2} />
        </Card>

        {/* account */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>Account</Eyebrow>
        <Card style={styles.cardNoPad}>
          <Row icon="user" label="Personal info" sub={me?.email ?? '—'} onPress={() => router.push('/edit_personal')} />
          <Row icon="cap" label="Courses & rates" sub={coursesSub} onPress={() => router.push('/edit_rates')} />
          <Row icon="cal" label="Availability" sub="Set your typical week" onPress={() => router.push('/edit_availability')} />
          <Row icon="edit" label="Edit tutor profile" sub="Photo, bio — what students see" onPress={() => router.push('/edit_tutor')} />
          <Row icon="dollar" label="Payout account" sub={payoutSub} onPress={setupPayouts} />
          <Row icon="doc" label="Earnings & payment history" onPress={() => router.push('/history')} last />
        </Card>

        {/* standing — cancellation count is real; response time has no data source yet */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>Standing</Eyebrow>
        <Card style={styles.cardNoPad}>
          <Row
            icon="shield"
            label="Cancellations"
            sub={stats ? `${stats.cancelledCount} total` : '—'}
            value={stats ? (stats.cancelledCount <= 2 ? 'Good' : 'Review') : ''}
            onPress={() => router.push('/standing')}
            last
          />
        </Card>

        {/* preferences */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>Preferences</Eyebrow>
        <Card style={styles.cardNoPad}>
          <Row icon="bell" label="Notifications" sub="Reminders, messages, offers" onPress={() => router.push('/notifications')} />
          <Row icon="gear" label="Dark mode" control={<Toggle on={dark} onPress={toggleDark} />} />
          {/* Names the colour, not the university. The reply to App Review answers
              Apple's IP question with "no university trademarks", and naming a specific
              school as a product feature contradicted it (APP_REVIEW_TICKETS.md T22). */}
          <Row icon="flame" label="School colors" sub="Crimson accent" control={<Toggle on={school} onPress={toggleSchool} />} />
          <Row icon="help" label="Help & support" onPress={() => router.push('/help')} last />
        </Card>

        {/* add ambassador role if not held yet (switching between held roles is the switcher above) */}
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
