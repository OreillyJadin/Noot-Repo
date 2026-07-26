// P2 My Courses (Edit) — ported from screens-edit.jsx (EditCourses). Student-only
// settings editor for the courses that power the For-You feed. Prefills from
// api.getMe().courses and persists via api.profile.setCourses(...).
//
// Courses are PICKED FROM THE CATALOG (`courses`), not typed. This screen used to take any
// string and uppercase it, so a student could save "MATH125" while a tutor saved "MATH 125"
// and the two would never match — which quietly breaks the matching the feed is built on.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Label, Ic, useTheme } from '@noot/ui';
import { api, type CatalogCourse } from '@noot/core';
import { CoursePicker } from '../lib/CoursePicker';

export default function EditCourses() {
  const t = useTheme();
  const router = useRouter();
  const [courses, setCourses] = useState<string[]>([]);
  // Real titles for the codes already saved, so the list reads "MATH 125 · Calculus I"
  // instead of a bare code. Codes saved before the picker existed simply have no title.
  const [titles, setTitles] = useState<Record<string, CatalogCourse>>({});
  const [, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getMe()
      .then((me) => {
        if (!active || !me) return;
        setCourses(me.courses);
        return api.courses.byCodes(me.courses).then((m) => { if (active) setTitles(m); });
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const add = (c: CatalogCourse) => {
    setTitles((m) => ({ ...m, [c.courseCode]: c }));
    setCourses((cs) => (cs.includes(c.courseCode) ? cs : [...cs, c.courseCode]));
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
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.courseText, { color: t.text }]}>{c}</Text>
                {titles[c] ? (
                  <Text numberOfLines={1} style={[styles.courseSub, { color: t.text3 }]}>{titles[c]!.courseTitle}</Text>
                ) : null}
              </View>
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

        <View style={{ marginTop: 16 }}>
          <CoursePicker selected={courses} onSelect={add} />
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
  courseText: { fontSize: 15, fontWeight: '600' },
  courseSub: { fontSize: 12, marginTop: 1 },
  removeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingHorizontal: 14, paddingVertical: 18, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 16 },
});
