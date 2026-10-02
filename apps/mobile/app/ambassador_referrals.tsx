// Ambassador → Referrals tab. The same invite screen everyone gets (InviteView: code, Noot
// credit, people invited), which for an ambassador also shows their goals and cash-out.
import React, { useRef } from 'react';
import { View, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, TabBar, H1, Sub, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { InviteView } from '../lib/InviteView';

export default function AmbassadorReferrals() {
  const t = useTheme();
  const { role } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });
  const { reloadKey, onRefresh } = usePullToRefresh();

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <H1 style={{ fontSize: 26 }}>Refer &amp; earn</H1>
        <Sub style={{ marginTop: 4 }}>$5 in Noot credit for every friend who completes a session, plus bonuses as you hit your goals.</Sub>
      </View>

      <Body ref={scrollRef} onRefresh={onRefresh} pad={20} contentStyle={{ paddingTop: 6 }}>
        <InviteView reloadKey={reloadKey} />
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
});
