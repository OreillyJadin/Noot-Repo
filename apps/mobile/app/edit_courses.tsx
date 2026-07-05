// P2 My Courses (Edit) — ported from screens-edit.jsx (EditCourses). Student-only
// settings editor for the courses that power the For-You feed. Prefills from
// api.getMe().courses and persists via api.profile.setCourses(...).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Field, Label, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';

export default function EditCourses() {
  const t = useTheme();
  const router = useRouter();
  const [courses, setCourses] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getMe()
      .then((me) => { if (active && me) setCourses(me.courses); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const add = () => {
    const c = draft.trim().toUpperCase();
    if (c && !courses.includes(c)) setCourses([...courses, c]);
    setDraft('');
  };

  const remove = (c: string) => setCourses(courses.filter((x) => x !== c));

  const save = async () => {
    try {
      await api.profile.setCourses(courses);
      Alert.alert('Courses updated');
      router.back();
    } catch {
      Alert.alert('Could not save', 'Please sign in and try again.');
    }
  };

  return (
    <Screen>
      <NavTop title="My courses" onBack={() => router.back()} />
      <Body>
        <Text style={[styles.intro, { color: t.text2 }]}>
          Your current courses power your For-You feed and exam reminders — we match tutors who took your exact
          classes, same professor when we can.
        </Text>

        <Label style={{ fontSize: 13, marginBottom: 10 }}>Current courses</Label>
        <View style={{ gap: 8 }}>
          {courses.map((c) => (
            <View key={c} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={[styles.iconBox, { backgroundColor: t.accentWeak }]}>
                <Ic name="cap" size={16} color={t.accent} strokeWidth={1.8} />
              </View>
              <Text style={[styles.courseText, { color: t.text }]}>{c}</Text>
              <Pressable onPress={() => remove(c)} style={[styles.removeBtn, { backgroundColor: t.surface2 }]}>
                <Ic name="x" size={13} color={t.text2} strokeWidth={2.2} />
              </Pressable>
            </View>
          ))}
          {courses.length === 0 ? (
            <View style={[styles.empty, { borderColor: t.borderStrong }]}>
              <Text style={{ fontSize: 13, color: t.text3 }}>No courses yet — add one below.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <Field label="Add a course" placeholder="e.g. MATH 125" value={draft} onChangeText={setDraft} />
          </View>
          <Button label="Add" kind="tint" size="md" iconRight="plus" onPress={add} style={{ height: 50 }} />
        </View>
      </Body>
      <ActionBar>
        <Button label="Save changes" full onPress={save} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, borderWidth: 1 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  courseText: { flex: 1, fontSize: 15, fontWeight: '600' },
  removeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingHorizontal: 14, paddingVertical: 18, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 16 },
});
