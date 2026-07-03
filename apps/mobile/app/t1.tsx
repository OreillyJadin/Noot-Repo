// T1 Become a Tutor — ported from screens-tutor.jsx (T1). Intro screen for the
// 10-step tutor application. → T2 Your profile.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, HeroIcon, H1, Sub, Eyebrow, Ic, useTheme, type IconName } from '@noot/ui';

const NEED: [IconName, string][] = [
  ['cap', 'Profile photo'],
  ['doc', 'Courses you can tutor'],
  ['shield', 'Transcripts or grade screenshots'],
  ['card', 'Bank account for payouts'],
];

export default function T1() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <NavTop title="Become a tutor" onBack={() => router.back()} />
      <Body pad={22}>
        <View style={{ marginTop: 8 }}>
          <HeroIcon name="cap" size={64} />
        </View>
        <H1 style={{ fontSize: 28, marginTop: 18, maxWidth: 280 }}>You&apos;re about to become a tutor.</H1>
        <Sub style={{ marginTop: 10 }}>About 10–15 minutes. You can save and pick up later — your progress is always kept.</Sub>

        <Eyebrow style={{ color: t.text3, marginTop: 26, marginBottom: 12 }}>You&apos;ll need</Eyebrow>
        <View style={{ gap: 10 }}>
          {NEED.map(([ic, label]) => (
            <View key={label} style={styles.needRow}>
              <View style={[styles.needIcon, { backgroundColor: t.accentWeak }]}>
                <Ic name={ic} size={20} color={t.accent} strokeWidth={1.8} />
              </View>
              <Text style={[styles.needLabel, { color: t.text }]}>{label}</Text>
            </View>
          ))}
        </View>
      </Body>
      <ActionBar>
        <Button label="Get started" kind="primary" full iconRight="chevron" onPress={() => router.push('/t2')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  needRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  needIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  needLabel: { fontSize: 16 },
});
