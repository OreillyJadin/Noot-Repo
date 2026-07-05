// P1 Edit Personal Info — ported from screens-edit.jsx (EditPersonal). Settings-style
// editor for student + tutor personal info. Prefills from api.getMe() and persists
// via api.profile.updatePersonal(...).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Field, Select, Label, Avatar, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';

export default function EditPersonal() {
  const t = useTheme();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [year, setYear] = useState('');
  const [major, setMajor] = useState('');
  const [email, setEmail] = useState('');
  const [, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getMe()
      .then((me) => {
        if (active && me) {
          setFirstName(me.firstName);
          setLastName(me.lastName);
          setYear(me.year ?? '');
          setMajor(me.major ?? '');
          setEmail(me.email);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const changePhoto = () => {
    // TODO(api): wire photo upload to backend.
    Alert.alert('Change photo', 'Coming soon — built with backend.');
  };

  const save = async () => {
    try {
      await api.profile.updatePersonal({
        firstName,
        lastName,
        year: year || null,
        major: major || null,
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
            <Avatar size={78} label={firstName.charAt(0).toUpperCase() || 'L'} />
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

        <Select label="Year" value={year} options={['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad']} onChange={setYear} />

        <Field label="Major" value={major} onChangeText={setMajor} />

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
});
