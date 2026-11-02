// S6 My Profile (student) — ported from screens-tabs.jsx (ProfileTab, role-locked as
// ProfileTabStudent). Every row here now leads to a real screen or mutation; the old
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
import { useRoleSwitch } from '../lib/useRoleSwitch';
import { useAdminHubCounts } from '../lib/AdminTabs';
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

export default function Profile() {
  const large = useLargeText();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
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
  const yearMajor = me?.major && me?.year ? `${me.major} ${me.year.toLowerCase()}` : me?.major ?? me?.year ?? '';
  const identitySubtitle = [yearMajor, '.edu verified'].filter(Boolean).join(' · ');

  const { roles, previewRoles, isAdmin, switchTo, select } = useRoleSwitch();
  const counts = useAdminHubCounts(isAdmin);
  const becomeAmbassador = async () => {
    try {
      await api.profile.addRole('ambassador');
      if (!(await switchTo('ambassador', ['ambassador']))) throw new Error('mode not saved');
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

    resetToSignedOut(router);

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

              resetToSignedOut(router);

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
                  <Avatar size={64} label={displayFirst[0]} uri={avatarUrl} />
                </View>
                <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change profile photo" style={[styles.editBadge, { backgroundColor: t.accent, borderColor: t.band }]}>
                  <Ic name="edit" size={11} color={t.onAccent} strokeWidth={2.2} />
                </Pressable>
              </View>
              <View style={styles.identityText}>
                {loading ? <Skeleton width={160} height={22} /> : <Text style={[styles.identityName, { color: t.onBand }]}>{displayName}</Text>}
                <Text style={[styles.identitySub, { color: t.onBand }]}>{identitySubtitle}</Text>
                <View style={styles.inlineStats}>
                  {STATS.map(([n, label], index) => (
                    <Text key={label} style={[styles.inlineStat, { color: t.onBand }]}>
                      {index ? ' · ' : ''}<Text style={[styles.inlineStatNumber, { color: t.onBand }]}>{n}</Text> {label.toLowerCase()}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          </BandHeader>
        }
      >
        {roles.length + previewRoles.length + (isAdmin ? 1 : 0) > 1 ? (
          <RoleSwitcher roles={roles} previewRoles={previewRoles} showAdmin={isAdmin} adminAttention={counts ? attentionTotal(counts) : 0} active={role} onSelect={select} />
        ) : null}

        <ListSection label="Account">
          <ListRow size="regular" icon={large ? undefined : 'user'} title="Personal info" accessibilityLabel={`Personal info, ${me?.email ?? '—'}`} trailing={<Text numberOfLines={1} style={[styles.emailValue, { color: t.text3 }]}>{me?.email ?? '—'}</Text>} onPress={() => router.push('/edit_personal')} />
          <ListRow size="regular" icon={large ? undefined : 'cap'} title="My courses" subtitle={me?.courses?.length ? undefined : coursesSub} trailing={me?.courses?.length ? <Text style={[styles.value, { color: t.text3 }]}>{me.courses.length} {me.courses.length === 1 ? 'course' : 'courses'}</Text> : undefined} onPress={() => router.push('/edit_courses')} />
          <ListRow size="regular" icon={large ? undefined : 'doc'} title="Booking & payment history" onPress={() => router.push('/history')} />
        </ListSection>

        {(showsReferCard(role) || tutorStatus !== 'approved' || !isAmbassador) ? (
          <ListSection label="Earn with noot">
            {showsReferCard(role) ? (
              <ListRow size="regular" icon={large ? undefined : 'gift'} title={isAmbassador ? 'Refer & earn' : 'Refer a friend'} subtitle={isAmbassador ? "$5 per friend's first session, plus goal bonuses" : '$5 credit when they finish a session'} onPress={openReferrals} />
            ) : null}
            {tutorStatus !== 'approved' ? (
              <ListRow
                size="regular"
                icon={large ? undefined : 'cap'}
                title={tutorStatus === 'pending' ? 'Tutor application in review' : tutorStatus === 'draft' ? 'Finish your tutor application' : tutorStatus === 'rejected' ? 'Tutor application not approved' : 'Become a tutor'}
                subtitle={tutorStatus === 'pending' ? 'We’re reviewing it — we’ll email you within 24 hours' : tutorStatus === 'draft' ? 'Pick up where you left off' : tutorStatus === 'rejected' ? 'Tap to review your details and apply again' : 'Tutor courses you aced'}
                muted={tutorStatus === 'pending'}
                onPress={tutorStatus === 'pending' ? undefined : () => router.push('/t1')}
              />
            ) : null}
            {!isAmbassador ? <ListRow size="regular" icon={large ? undefined : 'gift'} title="Become an ambassador" subtitle="Bonuses for invite goals" onPress={becomeAmbassador} /> : null}
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
          <ListRow size="regular" title={deleting ? 'Deleting…' : 'Delete account'} titleStyle={{ color: t.statusDark ? '#FF6B5E' : '#D23F31' }} onPress={deleting ? undefined : confirmDelete} chevron={false} />
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
  inlineStats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  inlineStat: { opacity: 0.85, fontSize: 12 },
  inlineStatNumber: { opacity: 1, fontWeight: '600' },
  emailValue: { fontSize: 13, maxWidth: 150 },
  value: { fontSize: 13 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 2 },
});
