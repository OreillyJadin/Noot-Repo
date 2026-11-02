// Tutor standing — reliability at a glance: completed sessions, cancellations, and the
// policy that governs standing. Real numbers from api.tutorStats(); ratings stay hidden.
import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ListSection, ListRow, Skeleton, useTheme } from '@noot/ui';
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

  return (
    <Screen>
      <NavTop title="Standing" onBack={() => router.back()} />
      <Body pad={16}>
        <Text style={[styles.status, { color: t.text }]}>Session record</Text>
        <Text style={[styles.statusSub, { color: t.text3 }]}>
          Cancellations and no-shows are recorded for admin review.
        </Text>

        <ListSection>
          <ListRow
            size="regular"
            title="Sessions completed"
            trailing={stats ? <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{stats.sessionsTaught}</Text> : <Skeleton width={40} height={24} />}
          />
          <ListRow
            size="regular"
            title="Cancellations"
            trailing={stats ? <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{stats.cancelledCount}</Text> : <Skeleton width={40} height={24} />}
          />
          <ListRow
            size="regular"
            title="Sessions missed"
            trailing={stats ? <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{stats.noShowCount}</Text> : <Skeleton width={40} height={24} />}
          />
        </ListSection>

        <ListSection label="How records work">
          <Text style={[styles.tip, { color: t.text2 }]}>
            Complete your booked sessions and let students know if plans change.
          </Text>
          <Text style={[styles.tip, { color: t.text2 }]}>
            Cancellations you make after confirming and sessions you miss are recorded. Student cancellations do not count against you.
          </Text>
          <Text style={[styles.tip, { color: t.text2 }]}>
            Our team reviews these records. Counts do not automatically pause bookings, change your ranking, or add penalties.
          </Text>
        </ListSection>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 18, fontWeight: '700' },
  statusSub: { fontSize: 13, lineHeight: 18 },
  tip: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, lineHeight: 20 },
});
