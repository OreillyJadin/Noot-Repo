// T10 Application In Review — ported from screens-tutor.jsx (T10). Final screen
// of the tutor application; no StepHead (matches source, which just pads for the
// safe area). → Tutor Home (dashboard tab root).
import React from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, HeroIcon, H1, Sub, Eyebrow, Ic, useTheme, type IconName } from '@noot/ui';
import { useApp } from '../lib/store';

const TASKS: [IconName, string][] = [
  ['user', 'Set notification preferences'],
  ['edit', 'Add a bio (recommended)'],
  ['star', 'Refer a tutor — earn $10'],
];

export default function T10() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setRole } = useApp();

  // Enter TUTOR MODE, not just the tutor dashboard route. Without this the app's `role`
  // stayed 'student' while sitting on /tutor_home, so <TabBar> rendered the STUDENT tab set
  // (Home -> /home) and the very next tap on Home threw the new tutor back into Student mode.
  // That was the reported "selecting Home returns you to Student Mode" bug. active_role isn't
  // persisted here: the tutor role isn't granted until an admin approves the application, and
  // the 0007 trigger would reject it — so this is a local mode switch until approval lands.
  const openDashboard = () => {
    setRole('tutor');
    router.replace('/tutor_home');
  };

  return (
    <Screen>
      <View style={{ height: insets.top, backgroundColor: t.bg }} />
      <Body pad={22}>
        <View style={styles.hero}>
          <HeroIcon name="clock" size={76} />
          <H1 style={{ fontSize: 27, marginTop: 18 }}>You&apos;re in review!</H1>
          <Sub style={{ marginTop: 10, maxWidth: 250, textAlign: 'center' }}>
            We&apos;ll email you within 24 hours once your grade verification is approved.
          </Sub>
        </View>

        <Eyebrow style={{ color: t.text3, marginTop: 14, marginBottom: 12 }}>While you wait</Eyebrow>
        <View style={{ gap: 8 }}>
          {TASKS.map(([ic, label]) => (
            <Card key={label} onPress={() => Alert.alert(label) /* TODO(api) */} style={styles.taskCard}>
              <View style={[styles.taskIcon, { backgroundColor: t.accentWeak }]}>
                <Ic name={ic} size={17} color={t.accent} strokeWidth={1.8} />
              </View>
              <Text style={[styles.taskLabel, { color: t.text }]}>{label}</Text>
              <Ic name="chevron" size={16} color={t.text3} strokeWidth={2} />
            </Card>
          ))}
        </View>
      </Body>
      <ActionBar>
        <Button label="Go to dashboard" kind="secondary" full onPress={openDashboard} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 18 },
  taskCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  taskIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  taskLabel: { flex: 1, fontSize: 15 },
});
