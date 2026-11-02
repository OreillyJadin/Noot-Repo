// Ambassador → Referrals tab. The same invite screen everyone gets (InviteView: code, Noot
// credit, people invited), which for an ambassador also shows their goals and cash-out.
import React, { useRef } from 'react';
import { Text, StyleSheet, type ScrollView } from 'react-native';
import { Screen, Body, BandHeader, TabBar, useTheme } from '@noot/ui';
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
    <Screen>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        pad={20}
        header={<BandHeader title="Refer & earn" />}
      >
        <Text style={[styles.subtitle, { color: t.text2 }]}>
          $5 in Noot credit for every friend who completes a session, plus bonuses as you hit your goals.
        </Text>
        <InviteView reloadKey={reloadKey} presentation="referralsTab" />
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, lineHeight: 20 },
});
