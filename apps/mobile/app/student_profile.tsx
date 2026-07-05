// S1 Student Profile Setup — ported from screens-student.jsx (StudentProfile).
// Step 3 of 3 in onboarding. "Complete profile" → Student Home.
// Prefills from api.getMe(); persists name/year/major/courses via @noot/core.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@noot/core';
import {
  Screen,
  NavTop,
  Body,
  ActionBar,
  Button,
  Field,
  Select,
  Divider,
  Eyebrow,
  Label,
  ProgressDots,
  Ic,
  useTheme,
} from '@noot/ui';

const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];

// ── local helpers (used only by this screen) ───────────────────────────────
function CourseChip({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: t.accentWeak }]}>
      <Text style={[styles.chipLabel, { color: t.accent }]}>{label}</Text>
      <Ic name="x" size={13} color={t.accent} strokeWidth={2.2} />
    </View>
  );
}

function AddCourseChip({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, styles.chipOutline, { backgroundColor: t.surface, borderColor: t.borderStrong }]}
    >
      <Ic name="plus" size={14} color={t.text2} strokeWidth={2.2} />
      <Text style={[styles.chipLabel, { color: t.text2 }]}>Add course</Text>
    </Pressable>
  );
}

export default function StudentProfile() {
  const t = useTheme();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [year, setYear] = useState('');
  const [major, setMajor] = useState('');
  const [courses, setCourses] = useState<string[]>([]);
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
          setCourses(me.courses);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const addCourse = () => {
    // TODO(api): course search — built with backend
  };

  const complete = async () => {
    try {
      await api.profile.updatePersonal({
        firstName,
        lastName,
        year: year || null,
        major: major || null,
      });
      await api.profile.setCourses(courses);
      router.push('/home');
    } catch {
      Alert.alert('Could not save', 'Please sign in and try again.');
    }
  };

  return (
    <Screen>
      <NavTop
        onBack={() => router.back()}
        title="Your profile"
        trailing={<Text style={[styles.stepLabel, { color: t.text3 }]}>3 of 3</Text>}
      />
      <Body pad={20}>
        <ProgressDots total={3} current={3} style={{ marginBottom: 22 }} />

        <Eyebrow style={{ color: t.text3 }}>Required</Eyebrow>
        <View style={styles.nameRow}>
          <View style={styles.flex1}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={styles.flex1}>
            <Field label="Last name" value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        <View style={styles.mt14}>
          <Select label="Year" value={year} options={YEAR_OPTIONS} onChange={setYear} />
        </View>

        <View style={styles.mt14}>
          <Field
            label="Major"
            placeholder="Search UA majors…"
            value={major}
            onChangeText={setMajor}
            suffix={<Ic name="search" size={18} color={t.text3} strokeWidth={1.8} />}
          />
        </View>

        <Divider style={styles.divider} />

        <Eyebrow style={{ color: t.text3 }}>Optional</Eyebrow>
        <Label style={{ marginTop: 10 }}>Current courses</Label>
        <View style={styles.chipWrap}>
          {courses.map((c) => (
            <CourseChip key={c} label={c} />
          ))}
          <AddCourseChip onPress={addCourse} />
        </View>
        <Text style={[styles.helpText, { color: t.text3 }]}>
          Helps us match tutors who took your exact classes — same professor when we can.
        </Text>
      </Body>
      <ActionBar>
        <Button label="Complete profile" kind="primary" full iconRight="chevron" onPress={complete} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 13, fontWeight: '600' },
  nameRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  flex1: { flex: 1 },
  mt14: { marginTop: 14 },
  divider: { marginTop: 22, marginBottom: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999 },
  chipOutline: { borderWidth: 1 },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  helpText: { fontSize: 13, marginTop: 10, lineHeight: 18 },
});
