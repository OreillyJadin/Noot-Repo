// Ambassador Home (dashboard). Noot credit balance, progress to the next goal, and the
// people you invited (joined → completed a session, +$5 credit) — all from api.credits
// (0040). Tab root for the ambassador mode.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, Eyebrow, Skeleton, EmptyState, ViewingAs, PreviewBanner, useTheme } from '@noot/ui';
import { api, type Invite, type Milestone } from '@noot/core';
import { dollars } from '../lib/InviteView';
import { useApp } from '../lib/store';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { GeckoLogo } from '../lib/GeckoLogo';

export default function AmbassadorHome() {
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
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Wordmark size={22} />
          <ViewingAs role="ambassador" preview={previewing} />
        </View>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={[styles.label, { color: t.text3 }]}>Ambassador</Text>
            <H2 style={{ fontSize: 24 }}>Hey, {firstName(me, 'there')}</H2>
          </View>
          <GeckoLogo size={40} />
        </View>
      </View>

      <Body ref={scrollRef} onRefresh={onRefresh} contentStyle={{ paddingTop: 8 }}>
        {/* earnings summary */}
        <View style={[styles.summary, { backgroundColor: t.accent }]}>
          <GeckoLogo style={styles.geckoDeco} />
          <Text style={[styles.summaryLabel, { color: t.onAccent }]}>NOOT CREDIT</Text>
          <Text style={[styles.summaryValue, { color: t.onAccent }]}>{loading ? '—' : dollars(balance)}</Text>
          <Text style={[styles.summarySub, { color: t.onAccent }]}>
            {loading
              ? ' '
              : `${invites.length} invited · ${completed} completed a session` +
                (nextGoal ? ` · next bonus at ${nextGoal.threshold}` : '')}
          </Text>
        </View>

        {/* share CTA */}
        <Card onPress={() => router.push('/ambassador_referrals')} style={{ ...styles.cta, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
          <View style={[styles.ctaIcon, { backgroundColor: t.accent }]}>
            <Ic name="gift" size={20} color={t.onAccent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctaTitle, { color: t.text }]}>Invite, earn, cash out</Text>
            <Text style={[styles.ctaSub, { color: t.text2 }]}>$5 credit per friend who completes a session, plus goal bonuses</Text>
          </View>
          <Ic name="chevR" size={17} color={t.accent} strokeWidth={2} />
        </Card>

        {/* referral pipeline */}
        <Eyebrow style={{ color: t.text3, marginTop: 22, marginBottom: 10 }}>People you invited</Eyebrow>
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
          <View style={{ gap: 10 }}>
            {invites.map((i) => (
              <Card key={i.referralId} style={styles.row}>
                <Avatar size={42} label={i.name.charAt(0) || 'A'} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: t.text }]}>{i.name}</Text>
                  <Text style={[styles.roleSub, { color: t.text3 }]}>
                    {i.reversed ? 'Session refunded — no credit' : i.completed ? 'Completed a session' : 'Waiting for their first session'}
                  </Text>
                </View>
                <Badge
                  label={i.reversed ? 'Refunded' : i.completed ? `+${dollars(i.rewardCents)}` : 'Joined'}
                  tone={i.completed && !i.reversed ? 'good' : 'neutral'}
                />
              </Card>
            ))}
          </View>
        )}
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  summary: { position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 18, marginBottom: 12 },
  geckoDeco: { position: 'absolute', right: -10, bottom: -18, width: 100, height: 100, opacity: 0.16, transform: [{ rotate: '10deg' }] },
  summaryLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  summaryValue: { fontSize: 40, fontWeight: '800', marginTop: 4 },
  summarySub: { fontSize: 12.5, opacity: 0.9, marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1 },
  ctaIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontSize: 14, fontWeight: '700' },
  ctaSub: { fontSize: 12.5, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  roleSub: { fontSize: 12.5, marginTop: 1 },
});
