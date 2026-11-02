// S4 Saved — ported from screens-tabs.jsx (SavedTab). Bottom-tab destination.
// Note: per screens-map.jsx this list has since been folded into the Sessions tab's
// "Saved" segment (see sessions.tsx), but the standalone route is kept per the nav map.
// Tapping a tutor stashes it on the in-progress booking draft and opens their profile (B2).
import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Body, BandHeader, Avatar, Ic, TabBar, EmptyState, ListSection, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { VERIFIED_EXPLAINER } from '../lib/VerifiedBadge';
import { tutorMeta } from '../lib/tutorMeta';

export default function Saved() {
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { patchBooking } = useApp();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.tutors
      .listSaved()
      .then((list) => { if (active) setTutors(list.map(toTutor)); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const open = (tutor: Tutor) => {
    patchBooking({ tutor, course: tutor.courses[0]?.[0] ?? '' });
    router.push('/b2');
  };

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  return (
    <Screen>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        pad={20}
        header={<BandHeader title="Saved" />}
      >
        <Text style={[styles.count, { color: t.text3 }]}>
          {loading ? 'Loading…' : `${tutors.length} tutor${tutors.length === 1 ? '' : 's'} saved for later`}
        </Text>
        {!loading && tutors.length > 0 ? (
          <ListSection label="Saved tutors">
            {tutors.map((tutor) => {
              const meta = tutorMeta(tutor);
              const nameDetails = [tutor.year, tutor.major].filter(Boolean).join(' · ');
              const sessionsLabel = `${tutor.sessions} ${tutor.sessions === 1 ? 'session' : 'sessions'}`;
              return (
                <Pressable
                  key={tutor.id}
                  onPress={() => open(tutor)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tutor.name}${meta.course ? `, ${meta.course}` : ''}${nameDetails ? `, ${nameDetails}` : ''}, ${sessionsLabel}${tutor.verified ? ', verified tutor' : ''}. $${tutor.rate} per hour`}
                  style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
                >
                  <Avatar size={48} uri={tutor.avatarUrl} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowHead}>
                      <View style={styles.nameWithCheck}>
                        <Text style={[styles.name, { color: t.text }]}>{tutor.name}</Text>
                        {tutor.verified ? (
                          <Pressable
                            onPress={() => Alert.alert('Verified tutor', VERIFIED_EXPLAINER)}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel="Verified tutor. Tap for what this means."
                          >
                            <Ic name="check" size={14} color={t.good} strokeWidth={2.6} />
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={[styles.rate, { color: t.text }]}>
                        ${tutor.rate}
                        <Text style={[styles.rateUnit, { color: t.text3 }]}>/hr</Text>
                      </Text>
                    </View>
                    <Text style={[styles.sub, { color: t.text2 }]}>{meta.line}</Text>
                  </View>
                  <Ic name="bookmark" size={19} color={t.accent} strokeWidth={1.6} fill={t.accent} />
                </Pressable>
              );
            })}
          </ListSection>
        ) : !loading ? (
          <EmptyState
            icon="bookmark"
            title="No saved tutors yet"
            subtitle="Tap the bookmark on any tutor to keep them here."
            actionLabel="Find tutors"
            onAction={() => router.replace('/student_home')}
          />
        ) : null}
      </Body>
      <TabBar active={active} onTab={onTab} role="student" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 13, marginBottom: 2 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 16, fontWeight: '600' },
  nameWithCheck: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  rate: { fontSize: 15, fontWeight: '700' },
  rateUnit: { fontSize: 11, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 2 },
});
