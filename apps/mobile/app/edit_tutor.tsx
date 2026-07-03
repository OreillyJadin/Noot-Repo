// P3 Edit Tutor Profile — ported from screens-edit.jsx (EditTutorProfile). The
// public-facing tutor profile editor. "Preview" jumps to the student-facing
// Tutor Profile (B2). Save is a front-end stub → back().
// TODO(api): wire to @noot/core profile.updateTutorProfile(...).
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Field, Avatar, Ic, useTheme } from '@noot/ui';

export default function EditTutorProfile() {
  const t = useTheme();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('Lindsay T.');
  const [about, setAbout] = useState(
    'Sophomore in Pre-Business. I took CH 101 with Prof. Weaver and pulled an A — I keep sessions practical: we work your actual problem sets, not generic notes.'
  );

  const changePhoto = () => {
    // TODO(api): wire photo upload to backend.
    Alert.alert('Change photo', 'Coming soon — built with backend.');
  };

  const save = () => {
    // TODO(api): persist tutor profile changes.
    Alert.alert('Tutor profile updated');
    router.back();
  };

  return (
    <Screen>
      <NavTop title="Edit tutor profile" onBack={() => router.back()} />
      <Body>
        <View style={styles.avatarWrap}>
          <View style={{ position: 'relative' }}>
            <Avatar size={78} label="L" />
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

        <Card onPress={() => router.push('/b2')} style={{ marginTop: 4, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
        <Button label="Save changes" full onPress={save} />
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
