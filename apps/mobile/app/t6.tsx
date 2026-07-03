// T6 Verify Grades — ported from screens-tutor.jsx (T6). Transcript / grade
// screenshot upload per course. Step 6 of the tutor application.
// → T7 Tutor agreement. "Save & exit" → Landing.
// File picking isn't wired to a backend yet — the dropzone is a no-op.
import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Badge, Eyebrow, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';

const FILES: [string, string, 'pending' | 'verified'][] = [
  ['CH 101', 'transcript.pdf', 'pending'],
  ['CH 102', 'ch102-grade.png', 'verified'],
];

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

export default function T6() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <StepHead
        step={6}
        title="Verify your grades"
        sub="Upload a transcript or screenshot per course."
        onBack={() => router.back()}
        onExit={() => router.replace('/')}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Pressable
          // TODO(api): wire up file picker (PDF/PNG transcript upload)
          onPress={() => {}}
          style={[styles.dropzone, { borderColor: t.accentBorder, backgroundColor: t.accentWeak }]}
        >
          <Ic name="upload" size={26} color={t.accent} strokeWidth={1.8} />
          <Text style={[styles.dropTitle, { color: t.accent }]}>Drop transcript or screenshots</Text>
          <Text style={[styles.dropSub, { color: t.text3 }]}>PDF or PNG · max 10MB</Text>
        </Pressable>

        <Eyebrow style={{ color: t.text3 }}>Coverage</Eyebrow>
        <View style={{ gap: 8 }}>
          {FILES.map(([course, file, status]) => (
            <Card key={course} style={styles.fileCard}>
              <View style={[styles.fileIcon, { backgroundColor: t.surface2, borderColor: t.border }]}>
                <Ic name="doc" size={18} color={t.text3} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileCourse, { color: t.text }]}>{course}</Text>
                <Text numberOfLines={1} style={[styles.fileName, { color: t.text3 }]}>
                  {file}
                </Text>
              </View>
              <Badge label={status === 'verified' ? 'Verified' : 'Pending'} tone={status === 'verified' ? 'good' : 'accentSoft'} />
            </Card>
          ))}
        </View>

        <Card flat style={[styles.lockCard, { backgroundColor: t.surfaceAlt }]}>
          <Ic name="lock" size={18} color={t.good} strokeWidth={1.7} />
          <Text style={[styles.lockText, { color: t.text2 }]}>
            Reviewed by a noot team member within 24h. <Text style={{ color: t.text, fontWeight: '700' }}>We never share your transcript.</Text>
          </Text>
        </Card>

        <Text style={[styles.finePrint, { color: t.text3 }]}>
          If a grade comes back below B-, only that course is removed — you stay on the platform.
        </Text>
      </Body>
      <ActionBar>
        <Button label="Submit for review" kind="primary" full onPress={() => router.push('/t7')} />
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
  dropzone: { height: 110, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dropTitle: { fontSize: 15, fontWeight: '600' },
  dropSub: { fontSize: 12 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  fileIcon: { width: 34, height: 40, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fileCourse: { fontSize: 15, fontWeight: '600' },
  fileName: { fontSize: 13 },
  lockCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14 },
  lockText: { flex: 1, fontSize: 13, lineHeight: 19 },
  finePrint: { fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
});
