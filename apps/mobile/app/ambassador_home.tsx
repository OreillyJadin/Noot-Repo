// Ambassador Home (dashboard). Noot credit balance, progress to the next goal, and the
// people you invited (joined → completed a session, +$5 credit) — all from api.credits
// (0040). Tab root for the ambassador mode.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Body, BandHeader, TabBar, Badge, Avatar, Ic, Skeleton, EmptyState, ViewingAs, ListSection, useTheme, useLargeText } from '@noot/ui';
import { api, type Invite, type Milestone } from '@noot/core';
import { dollars } from '../lib/InviteView';
import { useApp } from '../lib/store';
import { useMe } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { AdminShortcut } from '../lib/AdminShortcut';

export default function AmbassadorHome() {
  const large = useLargeText();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { role } = useApp();
  const { me } = useMe();
  const [balance, setBalance] = useState(0);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  useEffect(() => {
    let alive = true;
    Promise.all([api.credits.balance(), api.credits.invites(), api.credits.milestones()])
      .then(([b, i, m]) => {
        if (!alive) return;
        setBalance(b);
        setInvites(i);
        setMilestones(m);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  const previewing = !(me?.roles ?? []).includes('ambassador');
  const completed = invites.filter((i) => i.completed && !i.reversed).length;
  const nextGoal = milestones.find((m) => m.threshold > completed);

  return (
    <Screen>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        pad={20}
        header={<BandHeader title="Ambassador" trailing={<AdminShortcut color={t.onBand} ringColor={t.band} />} />}
      >
        <ViewingAs role="ambassador" preview={previewing} />
        {/* earnings summary */}
        <View style={[styles.summary, { backgroundColor: t.accent }]}>
          <Text style={[styles.summaryLabel, { color: t.onAccent }]}>Noot credit</Text>
          <Text style={[styles.summaryValue, { color: t.onAccent }]}>{loading ? '—' : dollars(balance)}</Text>
          <Text style={[styles.summarySub, { color: t.onAccent }]}>
            {loading
              ? ' '
              : `${invites.length} invited · ${completed} completed a session` +
                (nextGoal ? ` · next bonus at ${nextGoal.threshold}` : '')}
          </Text>
        </View>

        {/* share CTA */}
        <Pressable
          onPress={() => router.push('/ambassador_referrals')}
          accessibilityRole="button"
          style={[styles.cta, { borderBottomColor: t.border }]}
        >
          <Ic name="gift" size={20} color={t.accent} strokeWidth={1.8} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctaTitle, { color: t.text }]}>Invite, earn, cash out</Text>
            <Text style={[styles.ctaSub, { color: t.text2 }]}>$5 credit per friend who completes a session, plus goal bonuses</Text>
          </View>
          <Ic name="chevR" size={17} color={t.accent} strokeWidth={2} />
        </Pressable>

        {/* referral pipeline */}
        <Text style={[styles.sectionTitle, { color: t.text }]}>People you invited</Text>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={64} radius={16} />
            <Skeleton height={64} radius={16} />
          </View>
        ) : invites.length === 0 ? (
          <EmptyState
            icon="gift"
            title="No invites yet"
            subtitle="Share your code — friends who sign up with it show up here."
            actionLabel="Invite a friend"
            onAction={() => router.push('/ambassador_referrals')}
          />
        ) : (
          <ListSection>
            {invites.map((i) => {
              const badge = (
                <Badge
                  label={i.reversed ? 'Refunded' : i.completed ? `+${dollars(i.rewardCents)}` : 'Joined'}
                  tone={i.completed && !i.reversed ? 'good' : 'neutral'}
                />
              );
              return (
                <View key={i.referralId} style={styles.row}>
                  <Avatar size={42} label={i.name.charAt(0) || 'A'} />
                  <View style={{ flex: 1, minWidth: 0, gap: large ? 6 : 0 }}>
                    <Text style={[styles.name, { color: t.text }]}>{i.name}</Text>
                    <Text style={[styles.roleSub, { color: t.text3 }]}>
                      {i.reversed ? 'Session refunded' : i.completed ? 'Completed a session' : 'Waiting for their first session'}
                    </Text>
                    {large ? <View style={{ flexDirection: 'row' }}>{badge}</View> : null}
                  </View>
                  {large ? null : badge}
                </View>
              );
            })}
          </ListSection>
        )}
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 20, padding: 18 },
  summaryLabel: { fontSize: 13, fontWeight: '600', opacity: 0.9 },
  summaryValue: { fontSize: 40, fontWeight: '800', marginTop: 4 },
  summarySub: { fontSize: 12.5, opacity: 0.9, marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ctaTitle: { fontSize: 14, fontWeight: '700' },
  ctaSub: { fontSize: 12.5, marginTop: 2 },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  roleSub: { fontSize: 12.5, marginTop: 1 },
});
