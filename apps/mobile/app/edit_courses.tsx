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
import { Screen, NavTop, Body, ActionBar, Button, ListSection, ListRow, Ic, useTheme } from '@noot/ui';
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
          Your courses power your For-You feed. We match you with tutors who took the same class.
        </Text>

        <ListSection label="Current courses">
          {courses.map((c) => (
            <ListRow
              key={c}
              size="regular"
              title={c}
              subtitle={titles[c]?.courseTitle}
              trailing={
                <Pressable
                  onPress={() => remove(c)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${c}`}
                >
                  <Ic name="x" size={18} color={t.text3} strokeWidth={2} />
                </Pressable>
              }
            />
          ))}
          {courses.length === 0 ? <ListRow size="regular" title="No courses yet. Add one below." muted /> : null}
        </ListSection>

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
});
