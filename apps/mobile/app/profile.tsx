// S6 My Profile (student) — ported from screens-tabs.jsx (ProfileTab, role-locked as
// ProfileTabStudent). Every row here now leads to a real screen or mutation; the old
// stub-Alert helper is gone (APP_REVIEW_TICKETS.md T12). "Dark mode" is a local visual
// toggle only (not wired to the real theme yet — that lives in ThemeProvider at the app root).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Toggle, Ic, H1, H2, Eyebrow, TabBar, RoleSwitcher, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api, auth } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe, fullName, firstName } from '../lib/useMe';
import { useRoleSwitch } from '../lib/useRoleSwitch';
import { showsReferCard } from '../lib/roleTabs';
import { errText } from '../lib/errText';
import { useThemePref } from '../lib/themePref';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { pickAndUploadAvatar } from '../lib/avatar';
import { openLegal } from '../lib/legal';
import Constants from 'expo-constants';
import { versionLabel } from '../lib/appVersion';
import { forgetThisDevice } from '../lib/push';

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
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useApp();
  const { me, loading, tutorStatus } = useMe();
  const [deleting, setDeleting] = useState(false);
  const { dark, toggle: toggleDark, school, toggleSchool } = useThemePref();

  const displayName = fullName(me, 'Student');
  const displayFirst = firstName(me, 'Student');

  // Straight from useMe: the upload fires onUserChanged, so every screen showing the photo
  // updates together. A per-screen copy is what lost the photo across a role switch (S1).
  const avatarUrl = me?.avatarUrl ?? null;
  const changePhoto = async () => {
    await pickAndUploadAvatar();
  };

  // Real study stats + saved-tutor count.
  const [stats, setStats] = useState<{ sessionsCompleted: number; hoursLearned: number } | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    api.studentStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    api.tutors.listSaved().then((l) => { if (active) setSavedCount(l.length); }).catch(() => {});
    return () => { active = false; };
  }, [reloadKey]);

  const STATS: [string, string][] = [
    [stats ? String(stats.sessionsCompleted) : '—', 'Sessions'],
    [stats ? String(Math.round(stats.hoursLearned)) : '—', 'Hours'],
    [savedCount != null ? String(savedCount) : '—', 'Saved'],
  ];
  const coursesSub = me?.courses?.length ? me.courses.join(', ') : 'Add the courses you’re taking';

  const { roles, previewRoles, isAdmin, switchTo } = useRoleSwitch();
  const becomeAmbassador = async () => {
    try {
      await api.profile.addRole('ambassador');
      await switchTo('ambassador');
    } catch {
      Alert.alert('Could not join the ambassador program', 'Please try again in a moment.');
    }
  };
  // Referral CTA: everyone can invite and earn Noot credit (/invite). Ambassadors go to their
  // own tab, which adds goals and cash-out. Becoming an ambassador is its own card at the
  // bottom of the page. Hidden in ambassador mode (ERR-025): the Referrals tab is right there
  // in the tab bar. An ambassador viewing as a student keeps it — that mode has no such tab.
  const isAmbassador = roles.includes('ambassador');
  const openReferrals = () => router.push(isAmbassador ? '/ambassador_referrals' : '/invite');

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  // The old handler only navigated — it never called signOut, so the session stayed alive

  // and relaunching the app dropped you straight back in as the same user.

  const signOutNow = async () => {

    // While the session still exists: stop this account's notifications coming to this phone.
    await forgetThisDevice();
    try { await auth.signOut(); } catch { /* clear the UI regardless */ }

    router.replace('/');

  };


  const confirmDelete = () => {

    Alert.alert(

      'Delete your account?',

      'This permanently deletes your profile, photo, courses and messages, and you will be '

        + 'signed out. It cannot be undone.\n\n'

        + 'Records of completed, paid sessions are kept in anonymised form — we are required to '

        + 'retain them for tax and payment-dispute purposes. They no longer identify you.',

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Delete account',

          style: 'destructive',

          onPress: async () => {

            setDeleting(true);

            try {

              await api.profile.deleteAccount();

              // The session is dead server-side; clear it locally before leaving.

              try { await auth.signOut(); } catch { /* already invalid */ }

              router.replace('/');

            } catch (e) {

              setDeleting(false);

              Alert.alert('Could not delete your account', errText(e, 'Please try again.'));

            }

          },

        },

      ],

    );

  };


  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
        <View style={styles.headerRow}>
          <H1 style={styles.headerTitle}>Profile</H1>
        </View>
      </View>
      <Body ref={scrollRef} onRefresh={onRefresh} pad={20} contentStyle={{ paddingTop: 10 }}>
        {/* identity card */}
        <Card style={{ padding: 18 }}>
          <View style={styles.identityRow}>
            <View style={{ position: 'relative' }}>
              <Avatar size={64} label={displayFirst[0]} uri={avatarUrl} />
              <Pressable
                onPress={changePhoto}
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

        {/* mode switcher — the modes you hold, plus Tutor as a preview while the application is in review */}
        {roles.length + previewRoles.length > 1 ? (
          <View style={{ marginTop: 16 }}>
            <RoleSwitcher roles={roles} previewRoles={previewRoles} active={role} onSelect={switchTo} />
          </View>
        ) : null}

        {/* referral CTA — no fabricated credit balance */}
        {showsReferCard(role) ? (
          <Card onPress={openReferrals} style={{ ...styles.promo, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
            <View style={[styles.promoIcon, { backgroundColor: t.accent }]}>
              <Ic name="gift" size={20} color={t.onAccent} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.promoTitle, { color: t.text }]}>{isAmbassador ? 'Refer & earn' : 'Refer a friend'}</Text>
              <Text style={[styles.promoSub, { color: t.text2 }]}>
                {isAmbassador
                  ? '$5 credit per friend who completes a session, plus goal bonuses'
                  : 'Get $5 in Noot credit when a friend completes a session'}
              </Text>
            </View>
            <Ic name="chevR" size={17} color={t.accent} strokeWidth={2} />
          </Card>
        ) : null}

        {/* account */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>Account</Eyebrow>
        <Card style={styles.cardNoPad}>
          <Row icon="user" label="Personal info" sub={me?.email ?? '—'} onPress={() => router.push('/edit_personal')} />
          <Row icon="cap" label="My courses" sub={coursesSub} onPress={() => router.push('/edit_courses')} />
          <Row icon="doc" label="Booking & payment history" onPress={() => router.push('/history')} last />
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
          <Row icon="help" label="Help & support" onPress={() => router.push('/help')} />
          <Row icon="lock" label="Blocked users" onPress={() => router.push('/blocked_users')} />
          <Row icon="shield" label="Privacy Policy" onPress={() => openLegal('privacy')} />
          <Row icon="doc" label="Terms of Service" onPress={() => openLegal('terms')} last />
        </Card>

        {/* add roles you don't hold yet */}
        {tutorStatus !== 'approved' ? (
          <Card
            onPress={() => (tutorStatus === 'pending' ? undefined : router.push('/t1'))}
            style={styles.switchCard}
          >
            <View style={[styles.switchIcon, { backgroundColor: t.surface2 }]}>
              <Ic name="cap" size={21} color={t.accent} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: t.text }]}>
                {tutorStatus === 'pending'
                  ? 'Tutor application in review'
                  : tutorStatus === 'draft'
                    ? 'Finish your tutor application'
                    : tutorStatus === 'rejected'
                      ? 'Tutor application not approved'
                      : 'Become a tutor'}
              </Text>
              <Text style={[styles.switchSub, { color: t.text3 }]}>
                {tutorStatus === 'pending'
                  ? 'We’re reviewing it — we’ll email you within 24 hours'
                  : tutorStatus === 'draft'
                    ? 'Pick up where you left off'
                    : tutorStatus === 'rejected'
                      ? 'Tap to review your details and apply again'
                      : 'Earn money helping classmates in courses you aced'}
              </Text>
            </View>
            <Ic name="chevR" size={18} color={t.text3} strokeWidth={2} />
          </Card>
        ) : null}
        {!isAmbassador ? (
          <Card onPress={becomeAmbassador} style={styles.switchCard}>
            <View style={[styles.switchIcon, { backgroundColor: t.surface2 }]}>
              <Ic name="gift" size={21} color={t.accent} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: t.text }]}>Become an ambassador</Text>
              <Text style={[styles.switchSub, { color: t.text3 }]}>Earn bonuses for invite goals and cash out your Noot credit</Text>
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

        {/* sign out + account deletion (App Store 5.1.1(v) requires an in-app delete route) */}
        <View style={{ marginTop: 4 }}>
          <Card style={styles.cardNoPad}>
            <Row icon="logout" label="Sign out" danger onPress={signOutNow} />
            <Row
              icon="x"
              label={deleting ? 'Deleting…' : 'Delete account'}
              danger
              onPress={deleting ? undefined : confirmDelete}
              last
            />
          </Card>
        </View>
        <Text style={[styles.footer, { color: t.text3 }]}>
          noot · {versionLabel(Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber)} · Peer tutoring for campus
        </Text>
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
