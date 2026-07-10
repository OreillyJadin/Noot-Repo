// T9 Review Profile — ported from screens-tutor.jsx (T9). Preview of the tutor
// card before submission. Step 9 of the tutor application. → T10 In review.
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Badge, Avatar, H2, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';

// Shared step header for T2–T9. Defined locally per-screen (no shared file).
function StepHead({
  step,
  title,
  sub,
  onBack,
  onExit,
}: {
  step: number;
  title?: string;
  sub?: string;
  onBack: () => void;
  onExit: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 4, backgroundColor: t.bg }}>
      <View style={styles.stepRow}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.stepBack}>
          <Ic name="back" size={22} color={t.accent} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.stepLabel, { color: t.text3 }]}>Step {step} of 10</Text>
        <Text onPress={onExit} style={[styles.stepExit, { color: t.accent }]}>Save & exit</Text>
      </View>
      <View style={styles.stepBody}>
        <ProgressDots total={10} current={step} />
        {title ? <H1 style={styles.stepTitle}>{title}</H1> : null}
        {sub ? <Sub style={styles.stepSub}>{sub}</Sub> : null}
      </View>
    </View>
  );
}

export default function T9() {
  const t = useTheme();
  const router = useRouter();
  const { me } = useMe();
  const previewName = me ? `${me.firstName} ${me.lastName ? me.lastName.charAt(0) + '.' : ''}`.trim() : 'Your name';
  const previewMeta = [me?.year, me?.major].filter(Boolean).join(' · ') || 'Year · Major';

  return (
    <Screen>
      <StepHead step={9} title="How your profile looks" onBack={() => router.back()} onExit={() => router.replace('/')} />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Card onPress={() => router.push('/t2')} style={styles.previewCard}>
          <View style={styles.badgeRow}>
            <Badge label="Pending review" tone="accentSoft" />
          </View>
          <View style={styles.previewHead}>
            <Avatar size={56} />
            <View style={{ flex: 1 }}>
              <H2 style={{ fontSize: 18 }}>{previewName}</H2>
              <Text style={[styles.previewSub, { color: t.text3 }]}>{previewMeta}</Text>
              <View style={styles.courseBadges}>
                <Badge label="CH 101" tone="accentSoft" />
                <Badge label="CH 102" tone="accentSoft" />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.price, { color: t.text }]}>$25</Text>
              <Text style={[styles.priceUnit, { color: t.text3 }]}>/hr</Text>
            </View>
          </View>
          <View style={styles.previewFoot}>
            <View style={{ gap: 6 }}>
              {[100, 86, 60].map((w, i) => (
                <View key={i} style={[styles.fakeLine, { width: `${w}%`, backgroundColor: t.surface2 }]} />
              ))}
            </View>
            <View style={styles.statRow}>
              <View style={[styles.statBox, { backgroundColor: t.surface2 }]}>
                <Ic name="dollar" size={16} color={t.accent} strokeWidth={1.8} />
                <Text style={[styles.statLabel, { color: t.text2 }]}>CH 101</Text>
                <Text style={[styles.statValue, { color: t.text }]}>$25</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: t.surface2 }]}>
                <Ic name="star" size={16} color="none" fill={t.accent} />
                <Text style={[styles.statLabel, { color: t.text2 }]}>Online</Text>
                <Text style={[styles.statValue, { color: t.text }]}>Yes</Text>
              </View>
            </View>
          </View>
        </Card>

        <Pressable onPress={() => router.push('/t2')} style={[styles.editRow, { borderColor: t.borderStrong }]}>
          <Ic name="edit" size={18} color={t.text3} strokeWidth={1.7} />
          <Text style={[styles.editLabel, { color: t.text2 }]}>Tap to review &amp; change any of your info before submitting.</Text>
        </Pressable>
      </Body>
      <ActionBar>
        <Button label="Edit" kind="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/t2')} />
        <Button label="Submit for review" kind="primary" style={{ flex: 1.8 }} onPress={() => router.push('/t10')} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingLeft: 8, paddingRight: 12 },
  stepBack: { paddingVertical: 6, paddingRight: 6 },
  stepLabel: { flex: 1, fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  stepExit: { fontSize: 13, fontWeight: '600', width: 78, textAlign: 'right' },
  stepBody: { paddingHorizontal: 20, paddingTop: 8 },
  stepTitle: { fontSize: 24, marginTop: 14 },
  stepSub: { marginTop: 6, fontSize: 14 },
  previewCard: { padding: 0, overflow: 'hidden' },
  badgeRow: { paddingHorizontal: 16, paddingTop: 12, alignItems: 'flex-end' },
  previewHead: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  previewSub: { fontSize: 13, marginTop: 2 },
  courseBadges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  price: { fontSize: 20, fontWeight: '700' },
  priceUnit: { fontSize: 12 },
  previewFoot: { paddingHorizontal: 16, paddingBottom: 16 },
  fakeLine: { height: 7, borderRadius: 3 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  statLabel: { fontSize: 13, flexShrink: 1 },
  statValue: { fontSize: 13, fontWeight: '700', marginLeft: 'auto' },
  editRow: { marginTop: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', gap: 10, alignItems: 'center' },
  editLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
});
