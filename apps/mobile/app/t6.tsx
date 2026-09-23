// T6 Verify Grades — ported from screens-tutor.jsx (T6). Transcript / grade screenshot
// upload. Step 6 of the tutor application. → T7 Tutor agreement. "Save & exit" → Landing.
// Wired: the dropzone picks a PDF/image and uploads it to the private `transcripts` bucket
// via api.profile.uploadTranscript; admins review it (signed URL) in the approval queue.
// Can't be passed without either a transcript or the explicit "sign up as unverified"
// choice (tracker T4/T6), which is explained up front: no badge and the higher fee.

const pct = (rate: number) => `${+(rate * 100).toFixed(1)}%`;
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Screen, Body, ActionBar, Button, Card, Badge, Eyebrow, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { api, VERIFIED_FEE_RATE as VERIFIED_FEE, UNVERIFIED_FEE_RATE as UNVERIFIED_FEE } from '@noot/core';
import { useTutorApplication } from '../lib/useTutorApplication';
import { errText } from '../lib/errText';
import { readUriBytes } from '../lib/bytes';

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
  const { app, reload } = useTutorApplication();
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What's saved: a transcript from an earlier visit, or the "unverified" choice.
  const hasTranscript = !!uploaded || !!app?.transcriptUploaded;
  const skipped = !hasTranscript && !!app?.transcriptSkipped;

  const pick = async () => {
    if (busy) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setBusy(true);
      // Read the actual bytes — `fetch(uri).blob()` yields a file-backed RN Blob that Storage
      // writes as a 0-byte object.
      const bytes = await readUriBytes(asset.uri);
      if (bytes.byteLength === 0) throw new Error('That file came through empty.');
      const ext = asset.name?.split('.').pop() || 'pdf';
      await api.profile.uploadTranscript(bytes, ext, asset.mimeType);
      // Uploading after choosing "unverified" puts them back on the verified track.
      if (app?.transcriptSkipped) await api.profile.setTranscriptSkipped(false);
      setUploaded(asset.name ?? `transcript.${ext}`);
      void reload();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Signing up without a transcript is allowed (T6) but has consequences — say them first.
  const skip = () =>
    Alert.alert(
      'Sign up as unverified?',
      `You can tutor without a transcript, but you won’t get the Verified badge and noot’s fee is ${pct(UNVERIFIED_FEE)} of each session instead of ${pct(VERIFIED_FEE)}. You can upload a transcript later to get verified.`,
      [
        { text: 'Upload instead', style: 'cancel' },
        {
          text: 'Continue unverified',
          onPress: async () => {
            try {
              await api.profile.setTranscriptSkipped(true);
              router.push('/t7');
            } catch (e) {
              Alert.alert('Could not save', errText(e, 'Please try again.'));
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <StepHead
        step={6}
        title="Verify your grades"
        sub="Upload a transcript or grade screenshot."
        onBack={() => router.back()}
        onExit={() => router.replace('/')}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <Pressable
          onPress={pick}
          disabled={busy}
          style={[styles.dropzone, { borderColor: t.accentBorder, backgroundColor: t.accentWeak }]}
        >
          {busy ? (
            <>
              <ActivityIndicator color={t.accent} />
              <Text style={[styles.dropTitle, { color: t.accent }]}>Uploading…</Text>
            </>
          ) : (
            <>
              <Ic name="upload" size={26} color={t.accent} strokeWidth={1.8} />
              <Text style={[styles.dropTitle, { color: t.accent }]}>Tap to upload transcript or screenshot</Text>
              <Text style={[styles.dropSub, { color: t.text3 }]}>PDF or image · max 10MB</Text>
            </>
          )}
        </Pressable>

        <Eyebrow style={{ color: t.text3 }}>Uploaded</Eyebrow>
        {hasTranscript ? (
          <Card style={styles.fileCard}>
            <View style={[styles.fileIcon, { backgroundColor: t.surface2, borderColor: t.border }]}>
              <Ic name="doc" size={18} color={t.accent} strokeWidth={1.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.fileCourse, { color: t.text }]}>{uploaded ?? 'Transcript'}</Text>
              <Text style={[styles.fileName, { color: t.text3 }]}>Sent for review</Text>
            </View>
            <Badge label="Pending" tone="accentSoft" />
          </Card>
        ) : (
          <Text style={[styles.fileName, { color: t.text3, paddingHorizontal: 2 }]}>
            {skipped ? 'You chose to sign up unverified. Upload a transcript any time to get verified.' : 'No transcript uploaded yet.'}
          </Text>
        )}

        <Card flat style={[styles.lockCard, { backgroundColor: t.surfaceAlt }]}>
          <Ic name="lock" size={18} color={t.good} strokeWidth={1.7} />
          <Text style={[styles.lockText, { color: t.text2 }]}>
            Reviewed by a noot team member within 24h. <Text style={{ color: t.text, fontWeight: '700' }}>We never share your transcript.</Text>
          </Text>
        </Card>

        <Text style={[styles.finePrint, { color: t.text3 }]}>
          If a grade comes back below B-, only that course is removed — you stay on the platform.
        </Text>

        <Card flat style={[styles.lockCard, { backgroundColor: t.surfaceAlt }]}>
          <Ic name="shield" size={18} color={t.accent} strokeWidth={1.7} />
          <Text style={[styles.lockText, { color: t.text2 }]}>
            <Text style={{ color: t.text, fontWeight: '700' }}>Why verify?</Text> Verified tutors get a ✓ badge
            students can see, and noot’s fee is {pct(VERIFIED_FEE)} instead of {pct(UNVERIFIED_FEE)}.
          </Text>
        </Card>
      </Body>
      <ActionBar>
        {hasTranscript || skipped ? (
          <Button label={hasTranscript ? 'Continue' : 'Continue unverified'} kind="primary" full onPress={() => router.push('/t7')} />
        ) : (
          <View style={{ flex: 1, gap: 10 }}>
            <Button label="Upload to continue" kind="primary" full disabled />
            <Text onPress={skip} accessibilityRole="button" style={[styles.skip, { color: t.text2 }]}>
              Skip — sign up as unverified
            </Text>
          </View>
        )}
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
  skip: { fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },
});
