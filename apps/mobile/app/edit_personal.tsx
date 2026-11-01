// P1 Edit Personal Info — ported from screens-edit.jsx (EditPersonal). Settings-style
// editor for student + tutor personal info. Prefills from api.getMe() and persists
// via api.profile.updatePersonal(...).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Field, Select, Label, Avatar, Ic, useTheme } from '@noot/ui';
import { api, ACADEMIC_YEAR_OPTIONS, academicYearLabel } from '@noot/core';
import { GraduationYearField } from '../lib/GraduationYearField';
import { SubjectField } from '../lib/SubjectField';
import { pickAndUploadAvatar } from '../lib/avatar';
import { useMe } from '../lib/useMe';
import { validatePersonal } from '../lib/profileValidation';

export default function EditPersonal() {
  const t = useTheme();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [year, setYear] = useState('');
  const [expectedYear, setExpectedYear] = useState('');
  const [major, setMajor] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The photo is read live from useMe (see profile.tsx) rather than copied at mount.
  const avatarUrl = useMe().me?.avatarUrl ?? null;
  const [, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getMe()
      .then((me) => {
        if (active && me) {
          setFirstName(me.firstName);
          setLastName(me.lastName);
          setYear(academicYearLabel(me.year));
          setExpectedYear(me.expectedGraduationYear?.toString() ?? '');
          setMajor(me.major ?? '');
          setEmail(me.email);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const changePhoto = async () => {
    await pickAndUploadAvatar();
  };

  const save = async () => {
    const validationError = validatePersonal({ firstName, lastName, year, major }, { requireYearMajor: false });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await api.profile.updatePersonal({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        year: year.trim() || null,
        expectedGraduationYear: year === 'Post Grad' || !expectedYear ? null : Number(expectedYear),
        major: major.trim() || null,
      });
      Alert.alert('Profile updated');
      router.back();
    } catch {
      Alert.alert('Could not save', 'Please sign in and try again.');
    }
  };

  return (
    <Screen>
      <NavTop title="Personal info" onBack={() => router.back()} />
      <Body>
        <View style={styles.avatarWrap}>
          <View style={{ position: 'relative' }}>
            <Avatar size={78} label={firstName.charAt(0).toUpperCase() || 'L'} uri={avatarUrl} />
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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name" value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        <Select label="Academic status" value={year} options={ACADEMIC_YEAR_OPTIONS} onChange={setYear} />
        <GraduationYearField year={year} value={expectedYear} onChange={setExpectedYear} />

        <SubjectField value={major} onChange={setMajor} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View>
          <Label style={{ fontSize: 13, marginBottom: 8 }}>Campus email</Label>
          <View style={[styles.lockedRow, { backgroundColor: t.surface2, borderColor: t.border }]}>
            <Ic name="lock" size={16} color={t.text3} strokeWidth={1.8} />
            <Text style={[styles.lockedEmail, { color: t.text2 }]}>{email || 'lindsay.t@students.edu'}</Text>
          </View>
          <Text style={[styles.lockedHint, { color: t.text3 }]}>Your verified .edu email can&apos;t be changed.</Text>
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
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  lockedEmail: { flex: 1, fontSize: 15 },
  lockedHint: { fontSize: 12, marginTop: 7 },
  error: { color: '#C0392B', fontSize: 14, marginTop: 10 },
});
