// P3 Edit Tutor Profile — ported from screens-edit.jsx (EditTutorProfile). The
// public-facing tutor profile editor. "Preview" jumps to the student-facing
// Tutor Profile (B2). Wired to @noot/core: prefills from api.getMe →
// tutors.getById (display name from the user, "About you" from the tutor bio)
// and persists the bio via profile.updateTutorProfile(...). Display name is
// derived from the user's name (not editable through this method) and photo
// upload is still a stub.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Field, Avatar, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { pickAndUploadAvatar } from '../lib/avatar';
import { useMe } from '../lib/useMe';

export default function EditTutorProfile() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  // The photo is read live from useMe (see profile.tsx) rather than copied at mount.
  const avatarUrl = useMe().me?.avatarUrl ?? null;
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The tutor's own profile, mapped to the same shape B2 renders — lets "Preview"
  // open B2 with real self data instead of an empty booking draft (NoSession).
  const [meTutor, setMeTutor] = useState<Tutor | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getMe()
      .then(async (me) => {
        if (!active || !me) return;
        const tutor = await api.tutors.getById(me.id);
        if (active && tutor) {
          const initial = tutor.lastName ? `${tutor.lastName.charAt(0)}.` : '';
          setDisplayName(`${tutor.firstName} ${initial}`.trim());
          setAbout(tutor.bio);
          setMeTutor(toTutor(tutor));
        }
      })
      .catch(() => {
        /* no session / no tutor profile → leave fields empty */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const changePhoto = async () => {
    await pickAndUploadAvatar();
  };

  // Seed the booking draft with the tutor's own profile (reflecting the currently
  // edited bio) and open B2 in read-only preview mode.
  const preview = () => {
    if (!meTutor) return;
    patchBooking({ tutor: { ...meTutor, bio: about.trim() || meTutor.bio }, course: meTutor.courses[0]?.[0] });
    router.push('/b2?preview=1');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.profile.updateTutorProfile({ bio: about.trim() });
      Alert.alert('Tutor profile updated');
      router.back();
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Edit tutor profile" onBack={() => router.back()} />
      <Body>
        <View style={styles.avatarWrap}>
          <View style={{ position: 'relative' }}>
            <Avatar size={78} label="L" uri={avatarUrl} />
            <Pressable
              onPress={changePhoto}
              style={[styles.avatarEdit, { backgroundColor: t.accent, borderColor: t.surface }]}
            >
              <Ic name="edit" size={12} color={t.onAccent} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text onPress={changePhoto} style={[styles.changePhoto, { color: t.accent }]}>
            Change photo
          </Text>
        </View>

        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          hint="Shown to students — first name + last initial."
        />

        <Field
          label="About you"
          multiline
          value={about}
          onChangeText={setAbout}
          hint="What students see on your profile. Mention the professor and how you run sessions."
        />

        <Card onPress={preview} style={{ marginTop: 4, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.iconBox, { backgroundColor: t.accentWeak }]}>
            <Ic name="search" size={17} color={t.accent} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.text }}>Preview your public profile</Text>
            <Text style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>See exactly what students see</Text>
          </View>
          <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
        </Card>

        <View style={styles.footNote}>
          <View style={{ marginTop: 1 }}>
            <Ic name="shield" size={14} color={t.good} strokeWidth={1.8} />
          </View>
          <Text style={[styles.footNoteText, { color: t.text3 }]}>
            Verified grades and session counts update automatically — you can&apos;t edit those.
          </Text>
        </View>
      </Body>
      <ActionBar>
        <Button label="Save changes" full onPress={save} disabled={saving} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', gap: 8, marginBottom: 6 },
  avatarEdit: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhoto: { fontSize: 13, fontWeight: '600' },
  iconBox: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 2 },
  footNoteText: { flex: 1, fontSize: 12, lineHeight: 17.4 },
});
