// Ambassador Home (dashboard). Running bonus total + the referred-user pipeline
// (signed up → first paid session / bonus pending → bonus earned), all live from
// api.ambassador (list-referrals edge function). Tab root for the ambassador mode.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, Eyebrow, Skeleton, EmptyState, ViewingAs, useTheme, type BadgeTone } from '@noot/ui';
import { api, type AmbassadorReferrals } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  signed_up: { label: 'Signed up', tone: 'neutral' },
  bonus_pending: { label: '$5 pending', tone: 'accentSoft' },
  bonus_paid: { label: 'Earned $5', tone: 'good' },
};

export default function AmbassadorHome() {
  const t = useTheme();
  const router = useRouter();
  const { role } = useApp();
  const { me } = useMe();
  const [data, setData] = useState<AmbassadorReferrals | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  useEffect(() => {
    let alive = true;
    // Ensure a profile/code exists, then load the referral pipeline + totals.
    api.ambassador
      .ensureProfile()
      .then(() => api.ambassador.listReferrals())
      .then((d) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const totals = data?.totals;
  const referrals = data?.referrals ?? [];

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Wordmark size={22} />
          <ViewingAs role="ambassador" />
        </View>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={[styles.label, { color: t.text3 }]}>Ambassador</Text>
            <H2 style={{ fontSize: 24 }}>Hey, {firstName(me, 'there')}</H2>
          </View>
          <Text style={{ fontSize: 40 }}>🦎</Text>
        </View>
      </View>

      <Body ref={scrollRef} contentStyle={{ paddingTop: 8 }}>
        {/* earnings summary */}
        <View style={[styles.summary, { backgroundColor: t.accent }]}>
          <Text style={styles.geckoDeco}>🦎</Text>
          <Text style={[styles.summaryLabel, { color: t.onAccent }]}>TOTAL EARNED</Text>
          <Text style={[styles.summaryValue, { color: t.onAccent }]}>
            {loading ? '—' : `$${(totals?.totalEarned ?? 0).toFixed(2)}`}
          </Text>
          <Text style={[styles.summarySub, { color: t.onAccent }]}>
            {loading ? ' ' : `${totals?.referrals ?? 0} referred · ${totals?.bonusesEarned ?? 0} bonuses earned`}
          </Text>
        </View>

        {/* share CTA */}
        <Card onPress={() => router.push('/ambassador_referrals')} style={{ ...styles.cta, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
          <View style={[styles.ctaIcon, { backgroundColor: t.accent }]}>
            <Ic name="gift" size={20} color={t.onAccent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctaTitle, { color: t.text }]}>Share your referral link</Text>
            <Text style={[styles.ctaSub, { color: t.text2 }]}>Invite classmates — earn $5 when they complete their first paid session</Text>
          </View>
          <Ic name="chevR" size={17} color={t.accent} strokeWidth={2} />
        </Card>

        {/* referral pipeline */}
        <Eyebrow style={{ color: t.text3, marginTop: 22, marginBottom: 10 }}>Your referrals</Eyebrow>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={64} radius={16} />
            <Skeleton height={64} radius={16} />
          </View>
        ) : referrals.length === 0 ? (
          <EmptyState
            icon="gift"
            title="No referrals yet"
            subtitle="Share your code — referred classmates and your bonuses will show up here."
            actionLabel="Share your link"
            onAction={() => router.push('/ambassador_referrals')}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {referrals.map((r) => {
              const s = STATUS[r.status] ?? STATUS.signed_up!;
              return (
                <Card key={r.referralId} style={styles.row}>
                  <Avatar size={42} label={r.name.charAt(0) || 'S'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { color: t.text }]}>{r.name}</Text>
                    <Text style={[styles.roleSub, { color: t.text3 }]}>Referred as {r.referredRole}</Text>
                  </View>
                  <Badge label={s.label} tone={s.tone} />
                </Card>
              );
            })}
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
  geckoDeco: { position: 'absolute', right: -10, bottom: -18, fontSize: 100, opacity: 0.16, transform: [{ rotate: '10deg' }] },
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
