// T2 Tutor Profile — ported from screens-tutor.jsx (T2). Step 2 of the tutor
// application. → T3 Courses you tutor. "Save & exit" → Landing.
// Saves name/year/major (users) and bio (tutor_profiles) on Continue and on Save & exit.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Field, Select, Avatar, Divider, ProgressDots, H1, Sub, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useMe } from '../lib/useMe';
import { pickAndUploadAvatar } from '../lib/avatar';
import { MajorPicker } from '../lib/MajorPicker';

const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate Student'];

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

export default function T2() {
  const t = useTheme();
  const router = useRouter();
  // Prefill from the signed-in user's real profile (empty until loaded / if unset).
  const { me } = useMe();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [year, setYear] = useState('');
  const [major, setMajor] = useState('');
  const [bio, setBio] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!me || prefilled) return;
    setFirst(me.firstName ?? '');
    setLast(me.lastName ?? '');
    setYear(me.year ?? '');
    setMajor(me.major ?? '');
    setPrefilled(true);
  }, [me, prefilled]);
  // The bio lives on tutor_profiles, not users — load it from the saved application.
  useEffect(() => {
    let active = true;
    api.profile
      .getMyTutorProfile()
      .then((p) => { if (active && p.bio) setBio((b) => b || p.bio); })
      .catch(() => { /* nothing saved yet */ });
    return () => { active = false; };
  }, []);

  // Everything on this step is saved — it used to be thrown away on Continue, which is why
  // step 9 and the public profile never showed it (tracker T1).
  const [saving, setSaving] = useState(false);
  const persist = async (): Promise<boolean> => {
    try {
      await api.profile.updatePersonal({
        firstName: first.trim(),
        lastName: last.trim(),
        year: year || null,
        major: major || null,
      });
      await api.profile.updateTutorProfile({ bio: bio.trim() });
      return true;
    } catch {
      Alert.alert('Could not save your profile', 'Please check your connection and try again.');
      return false;
    }
  };
  const saveAndContinue = async () => {
    if (saving) return;
    if (!first.trim() || !last.trim()) {
      Alert.alert('Add your name', 'Students see your first name and last initial.');
      return;
    }
    // Marked "Required" on this screen, and required to submit (T4).
    if (!me?.avatarUrl) {
      Alert.alert('Add a profile photo', 'Tap the + on the photo. A clear photo of your face — no group shots or filters.');
      return;
    }
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (ok) router.push('/t3');
  };
  const saveAndExit = async () => {
    if (first.trim() && last.trim()) await persist();
    router.replace('/');
  };

  const changePhoto = async () => {
    await pickAndUploadAvatar();
  };

  return (
    <Screen>
      <StepHead
        step={2}
        title="Your profile"
        sub="Students see this on your tutor card."
        onBack={() => router.back()}
        onExit={saveAndExit}
      />
      <Body pad={20} contentStyle={{ paddingTop: 14 } as ViewStyle}>
        <View style={styles.photoRow}>
          <View style={{ position: 'relative' }}>
            <Avatar size={64} uri={me?.avatarUrl} />
            <Pressable
              onPress={changePhoto}
              style={[styles.photoBadge, { backgroundColor: t.accent, borderColor: t.bg }]}
            >
              <Ic name="plus" size={13} color={t.onAccent} strokeWidth={2.6} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.photoTitleRow}>
              <Text style={[styles.photoTitle, { color: t.text }]}>Profile photo </Text>
              <Text style={[styles.photoTitle, { color: t.accent }]}>•</Text>
            </View>
            <Text style={[styles.photoHint, { color: t.text3 }]}>Required. Clear face, no group photos or filters.</Text>
          </View>
        </View>

        <Divider style={{ marginVertical: 18 }} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="First" value={first} onChangeText={setFirst} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last" value={last} onChangeText={setLast} />
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Select label="Year" value={year} options={YEAR_OPTIONS} onChange={setYear} />
        </View>

        <View style={{ marginTop: 14 }}>
          <MajorPicker value={major} onChange={setMajor} />
        </View>
        <View style={{ marginTop: 14 }}>
          <Field
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            multiline
            placeholder="Tell students why you're a great tutor…"
          />
        </View>
      </Body>
      <ActionBar>
        <Button
          label={saving ? 'Saving…' : 'Save & Continue'}
          kind="primary"
          full
          disabled={saving}
          onPress={saveAndContinue}
        />
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
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photoBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  photoTitleRow: { flexDirection: 'row' },
  photoTitle: { fontSize: 15, fontWeight: '600' },
  photoHint: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10 },
});
