// TP Tutor Profile — ported from screens-tabs.jsx (ProfileTab, role-locked as
// ProfileTabTutor). Every row here now leads to a real screen or mutation; the old
// stub-Alert helper is gone (APP_REVIEW_TICKETS.md T12). "Dark mode" is a local visual
// toggle only (not wired to the real theme yet — that lives in ThemeProvider at the app root).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { resetToSignedOut } from '../lib/resetToSignedOut';
import { Screen, Body, BandHeader, ListSection, ListRow, Avatar, Toggle, Ic, TabBar, RoleSwitcher, Skeleton, useTheme, useLargeText } from '@noot/ui';
import { api, auth, attentionTotal } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe, fullName, firstName } from '../lib/useMe';
import { useThemePref } from '../lib/themePref';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { openLegal } from '../lib/legal';
import { useRoleSwitch } from '../lib/useRoleSwitch';
import { useAdminHubCounts } from '../lib/AdminTabs';
import { openPayoutSetup } from '../lib/payoutSetup';
import { TutorStatusBanner } from '../lib/TutorStatusBanner';
import { errText } from '../lib/errText';
import { pickAndUploadAvatar } from '../lib/avatar';
import Constants from 'expo-constants';
import { versionLabel } from '../lib/appVersion';
import { forgetThisDevice } from '../lib/push';

export default function TutorProfile() {
  const large = useLargeText();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { role, setRole } = useApp();
  const { me, loading, tutorStatus, gradesVerified, refresh } = useMe();
  const [deletingTutorProfile, setDeletingTutorProfile] = useState(false);
  const { dark, toggle: toggleDark, school, toggleSchool } = useThemePref();

  const meName = fullName(me, 'Tutor');
  const meFirst = firstName(me, 'T');

  // Straight from useMe: the upload fires onUserChanged, so every screen showing the photo
  // updates together. A per-screen copy is what lost the photo across a role switch (S1).
  const avatarUrl = me?.avatarUrl ?? null;
  const changePhoto = async () => {
    await pickAndUploadAvatar();
  };
  const meYearMajor = [me?.year, me?.major].filter(Boolean).join(' · ') || '—';
  const identitySubtitle = [meYearMajor, gradesVerified ? 'Verified tutor' : null].filter(Boolean).join(' · ');

  // Stripe Connect (payout) status → drives the "Payout account" row + earnings promo.
  const [payouts, setPayouts] = useState<{ connected: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean } | null>(null);
  const refreshPayouts = () => api.connect.status().then((s) => setPayouts(s)).catch(() => {});
  useEffect(() => { void refreshPayouts(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Guard against concurrent taps. Each call to onboardingLink() used to be able to create
  // its own Stripe Connect account — the row is reachable while the Edge Function cold
  // starts, and double-tapping orphaned real accounts (APP_REVIEW_TICKETS.md T24). The
  // server is idempotent now; this just stops us asking twice.
  const [payoutBusy, setPayoutBusy] = useState(false);
  const payoutSub = payoutBusy
    ? 'Opening Stripe…'
    : payouts?.payoutsEnabled
    ? 'Connected · payouts enabled'
    : payouts?.connected
      ? 'Setup incomplete — finish onboarding'
      : 'Not connected — set up Stripe';
  const setupPayouts = async () => {
    if (payoutBusy) return;
    setPayoutBusy(true);
    try {
      if (await openPayoutSetup()) void refreshPayouts();
    } finally {
      setPayoutBusy(false);
    }
  };

  // Live teaching stats + the tutor's own courses (for the "Courses & rates" row).
  const [stats, setStats] = useState<{ sessionsTaught: number; hoursTaught: number; earnedTotal: number; avgRating: number | null; cancelledCount: number } | null>(null);
  const [coursesSub, setCoursesSub] = useState('Set your rates per course');
  useEffect(() => {
    let active = true;
    api.tutorStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    if (me) {
      // Own rows: the same reader onboarding and Courses & rates use (tracker T1).
      api.profile.getMyTutorProfile().then((p) => {
        if (!active || p.courses.length === 0) return;
        setCoursesSub(p.courses.map((c) => `${c.courseCode} · ${c.hourlyRate > 0 ? `$${c.hourlyRate}/hr` : 'no rate'}`).join(', '));
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [me, reloadKey]);

  // Ratings are collected but never surfaced in the app — no "Avg rating" stat here.
  const STATS: [string, string][] = [
    [stats ? String(stats.sessionsTaught) : '—', 'Sessions taught'],
    [stats ? String(Math.round(stats.hoursTaught)) : '—', 'Hours'],
  ];

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  // End the session, as the student profile does. This row used to only navigate away, so a
  // tutor who "signed out" stayed signed in and the app reopened as them.
  const signOutNow = async () => {
    // While the session still exists: stop this account's notifications coming to this phone.
    await forgetThisDevice();
    try { await auth.signOut(); } catch { /* clear the UI regardless */ }
    resetToSignedOut(router);
  };

  const confirmLeaveTutorRole = () => {
    Alert.alert(
      'Delete your tutor profile?',
      "You'll stop appearing to students and go back to your student account. Your student account, messages and payment history stay.\n\nTo tutor again you'll need to apply again, including a new transcript.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete tutor profile',
          style: 'destructive',
          onPress: async () => {
            setDeletingTutorProfile(true);
            try {
              await api.profile.leaveTutorRole();
              await refresh();
              setRole('student');
              router.replace('/home');
            } catch (e) {
              setDeletingTutorProfile(false);
              Alert.alert("Couldn't delete your tutor profile", errText(e, 'Please try again.'));
            }
          },
        },
      ],
    );
  };

  const { roles, previewRoles, isAdmin, switchTo, select } = useRoleSwitch();
  const counts = useAdminHubCounts(isAdmin);
  // Reachable BEFORE the application is finished — that was the "can only access their tutor
  // profile after completing the tutor application" report. Keyed on approval, not the role.
  const previewing = tutorStatus !== 'approved';
  const becomeAmbassador = async () => {
    try {
      await api.profile.addRole('ambassador');
      if (!(await switchTo('ambassador', ['ambassador']))) throw new Error('mode not saved');
    } catch {
      Alert.alert('Could not join the ambassador program', 'Please try again in a moment.');
    }
  };

  return (
    <Screen>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        pad={20}
        contentStyle={styles.bodyContent}
        header={
          <BandHeader title="Profile">
            <View style={[styles.identityRow, large && styles.identityStacked]}>
              <View style={styles.avatarWrap}>
                <View style={[styles.avatarRing, { borderColor: t.onBand }]}>
                  <Avatar size={64} label={meFirst[0]} uri={avatarUrl} />
                </View>
                <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change profile photo" style={[styles.editBadge, { backgroundColor: t.accent, borderColor: t.band }]}>
                  <Ic name="edit" size={11} color={t.onAccent} strokeWidth={2.2} />
                </Pressable>
              </View>
              <View style={styles.identityText}>
                {loading ? <Skeleton width={160} height={22} /> : <Text style={[styles.identityName, { color: t.onBand }]}>{meName}</Text>}
                <Text style={[styles.identitySub, { color: t.onBand }]}>{identitySubtitle}</Text>
                <View style={styles.inlineStats}>
                  {STATS.map(([number, label], index) => (
                    <Text key={label} style={[styles.inlineStat, { color: t.onBand }]}>
                      {index ? ' · ' : ''}<Text style={[styles.inlineStatNumber, { color: t.onBand }]}>{number}</Text> {label.toLowerCase()}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          </BandHeader>
        }
      >
        {previewing ? <TutorStatusBanner status={tutorStatus} onApply={() => router.push('/t1')} /> : null}
        {roles.length + previewRoles.length + (isAdmin ? 1 : 0) > 1 ? (
          <RoleSwitcher roles={roles} previewRoles={previewRoles} showAdmin={isAdmin} adminAttention={counts ? attentionTotal(counts) : 0} active={role} onSelect={select} />
        ) : null}

        <ListSection label="Earnings">
          <ListRow size="regular" icon={large ? undefined : 'dollar'} title={stats ? `$${stats.earnedTotal.toFixed(2)} earned` : 'Earnings'} subtitle={payouts?.payoutsEnabled ? 'Payouts enabled — you’re all set' : 'Connect Stripe to start receiving payouts'} onPress={setupPayouts} />
        </ListSection>

        <ListSection label="Account">
          <ListRow size="regular" icon={large ? undefined : 'user'} title="Personal info" subtitle={me?.email ?? '—'} onPress={() => router.push('/edit_personal')} />
          <ListRow size="regular" icon={large ? undefined : 'cap'} title="Courses & rates" subtitle={coursesSub} onPress={() => router.push('/edit_rates')} />
          <ListRow size="regular" icon={large ? undefined : 'cal'} title="Availability" subtitle="Set your typical week" onPress={() => router.push('/edit_availability')} />
          <ListRow size="regular" icon={large ? undefined : 'edit'} title="Edit tutor profile" subtitle="Photo, bio — what students see" onPress={() => router.push('/edit_tutor')} />
          <ListRow size="regular" icon={large ? undefined : 'dollar'} title="Payout account" subtitle={payoutSub} onPress={setupPayouts} />
          <ListRow size="regular" icon={large ? undefined : 'doc'} title="Earnings & payment history" onPress={() => router.push('/history')} />
        </ListSection>

        <ListSection label="Standing">
          <ListRow size="regular" icon={large ? undefined : 'shield'} title="Cancellations" subtitle={stats ? `${stats.cancelledCount} total` : '—'} trailing={stats ? <Text style={[styles.value, { color: t.text3 }]}>{stats.cancelledCount <= 2 ? 'Good' : 'Review'}</Text> : undefined} onPress={() => router.push('/standing')} />
        </ListSection>

        {!roles.includes('ambassador') ? (
          <ListSection label="Earn with noot">
            <ListRow size="regular" icon={large ? undefined : 'gift'} title="Become an ambassador" subtitle="Bonuses for invite goals" onPress={becomeAmbassador} />
          </ListSection>
        ) : null}

        <ListSection label="Preferences">
          <ListRow size="regular" icon={large ? undefined : 'bell'} title="Notifications" subtitle="Reminders, messages, offers" onPress={() => router.push('/notifications')} />
          <ListRow size="regular" icon={large ? undefined : 'gear'} title="Dark mode" trailing={<Toggle on={dark} onPress={toggleDark} />} chevron={false} />
          {/* Names the colour, not the university; this preserves the T22 App Review wording. */}
          <ListRow size="regular" icon={large ? undefined : 'flame'} title="School colors" subtitle="Crimson accent" trailing={<Toggle on={school} onPress={toggleSchool} />} chevron={false} />
        </ListSection>

        <ListSection label="Support">
          <ListRow size="regular" icon={large ? undefined : 'help'} title="Help & support" onPress={() => router.push('/help')} />
          <ListRow size="regular" icon={large ? undefined : 'lock'} title="Blocked users" onPress={() => router.push('/blocked_users')} />
          <ListRow size="regular" icon={large ? undefined : 'shield'} title="Privacy Policy" onPress={() => openLegal('privacy')} />
          <ListRow size="regular" icon={large ? undefined : 'doc'} title="Terms of Service" onPress={() => openLegal('terms')} />
        </ListSection>

        <ListSection>
          <ListRow size="regular" title="Sign out" titleStyle={{ color: t.statusDark ? '#FF6B5E' : '#D23F31' }} onPress={signOutNow} chevron={false} />
          <ListRow size="regular" title={deletingTutorProfile ? 'Deleting…' : 'Delete tutor profile'} titleStyle={{ color: t.statusDark ? '#FF6B5E' : '#D23F31' }} onPress={deletingTutorProfile ? undefined : confirmLeaveTutorRole} chevron={false} />
        </ListSection>
        <Text style={[styles.footer, { color: t.text3 }]}>noot {versionLabel(Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber)}</Text>
      </Body>
      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyContent: { paddingTop: 14, paddingBottom: 20, gap: 16 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  editBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  identityName: { fontSize: 20, fontWeight: '700' },
  identitySub: { opacity: 0.85, fontSize: 13 },
  inlineStats: { flexDirection: 'row', flexWrap: 'wrap' },
  inlineStat: { opacity: 0.85, fontSize: 12 },
  inlineStatNumber: { opacity: 1, fontWeight: '600' },
  value: { fontSize: 13 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 2 },
});
