// Tutor standing — reliability at a glance: completed sessions, cancellations, and the
// policy that governs standing. Real numbers from api.tutorStats(); ratings stay hidden.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Eyebrow, Ic, Skeleton, useTheme } from '@noot/ui';
import { api } from '@noot/core';

export default function Standing() {
  const t = useTheme();
  const router = useRouter();
  const [stats, setStats] = useState<{ sessionsTaught: number; cancelledCount: number; noShowCount: number } | null>(null);
  useEffect(() => {
    let active = true;
    api.tutorStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const good = stats ? stats.cancelledCount === 0 && stats.noShowCount === 0 : true;

  return (
    <Screen>
      <NavTop title="Standing" onBack={() => router.back()} />
      <Body pad={16}>
        <Card style={{ padding: 16, alignItems: 'center', gap: 8 }}>
          <View style={[styles.badge, { backgroundColor: good ? t.goodWeak : t.surface2 }]}>
            <Ic name="shield" size={26} color={good ? t.good : t.text3} strokeWidth={1.8} />
          </View>
          <Text style={[styles.status, { color: t.text }]}>{good ? 'Good standing' : 'Needs attention'}</Text>
          <Text style={[styles.statusSub, { color: t.text3 }]}>
            {good ? 'Keep it up — complete your booked sessions.' : 'Cancellations you make and sessions you miss affect your standing.'}
          </Text>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            {stats ? <Text style={[styles.statNum, { color: t.text }]}>{stats.sessionsTaught}</Text> : <Skeleton width={40} height={24} />}
            <Text style={[styles.statLabel, { color: t.text3 }]}>Sessions completed</Text>
          </Card>
          <Card style={styles.statCard}>
            {stats ? <Text style={[styles.statNum, { color: stats.cancelledCount ? t.text : t.text }]}>{stats.cancelledCount}</Text> : <Skeleton width={40} height={24} />}
            <Text style={[styles.statLabel, { color: t.text3 }]}>Cancellations</Text>
          </Card>
          <Card style={styles.statCard}>
            {stats ? <Text style={[styles.statNum, { color: t.text }]}>{stats.noShowCount}</Text> : <Skeleton width={40} height={24} />}
            <Text style={[styles.statLabel, { color: t.text3 }]}>Sessions missed</Text>
          </Card>
        </View>

        <Eyebrow style={{ marginTop: 22, marginBottom: 10, color: t.text3 }}>How standing works</Eyebrow>
        <Card flat style={{ padding: 14, backgroundColor: t.surfaceAlt, gap: 10 }}>
          {[
            'Complete your booked sessions to maintain good standing.',
            'Cancellations you make after confirming and sessions you miss count toward your standing. Student cancellations do not.',
            'Repeated no-shows can pause new bookings while our team reviews.',
          ].map((line) => (
            <View key={line} style={styles.tipRow}>
              <Ic name="check" size={14} color={t.good} strokeWidth={2.4} />
              <Text style={[styles.tip, { color: t.text2 }]}>{line}</Text>
            </View>
          ))}
        </Card>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: 18, fontWeight: '700' },
  statusSub: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  statCard: { flex: 1, padding: 14, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, textAlign: 'center' },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tip: { flex: 1, fontSize: 13, lineHeight: 18 },
});
