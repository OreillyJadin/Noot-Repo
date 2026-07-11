// Ambassador Home (dashboard shell). Phase 0 lands the tab root + "Viewing as
// Ambassador" indicator; Phase 1 wires the real referral share screen + the referred-user
// pipeline and running bonus total (api.ambassador.*). Tab root for the ambassador mode.
import React, { useRef } from 'react';
import { View, Text, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, TabBar, Wordmark, Card, Ic, H2, ViewingAs, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';

export default function AmbassadorHome() {
  const t = useTheme();
  const { role } = useApp();
  const { me } = useMe();
  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

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
        <Card flat style={{ ...styles.card, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
          <View style={[styles.icon, { backgroundColor: t.accent }]}>
            <Ic name="gift" size={20} color={t.onAccent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Refer classmates, earn $5 each</Text>
            <Text style={[styles.cardSub, { color: t.text2 }]}>
              Your referral link, referred-user status, and bonus total will live here.
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Ic name="clock" size={18} color={t.text3} strokeWidth={1.8} />
          <Text style={[styles.cardSub, { color: t.text3, flex: 1 }]}>
            The full ambassador dashboard is coming next — share sheet, referral pipeline, and
            running bonus total.
          </Text>
        </Card>
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
});
