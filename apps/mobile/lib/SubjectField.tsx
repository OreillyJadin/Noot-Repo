// Major field backed by the catalog's real subject list (132 values from `courses`).
//
// Major used to be a free text Field, so it stored whatever was typed — "CS", "Comp Sci",
// "computer science" and a typo were all equally valid and none of them grouped together.
// It's now a filter-as-you-type list. Free text is still accepted on purpose: a real major
// isn't always a course subject (double majors, interdisciplinary programmes), so refusing
// anything off-list would block legitimate answers. The list makes the common case exact.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { api } from '@noot/core';
import { Ic, useTheme } from '@noot/ui';

export function SubjectField({
  value,
  onChange,
  label = 'Major',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const t = useTheme();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api.courses
      .listSubjects()
      .then((s) => { if (active) setSubjects(s); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q ? subjects.filter((s) => s.toLowerCase().includes(q)) : subjects;
    // An exact hit needs no suggestions — don't hang a list under a finished answer.
    if (pool.length === 1 && pool[0]!.toLowerCase() === q) return [];
    return pool.slice(0, 8);
  }, [subjects, value]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.text2 }]}>{label}</Text>
      <View style={[styles.field, { backgroundColor: t.surface, borderColor: open ? t.accent : t.borderStrong }]}>
        <TextInput
          style={[styles.input, { color: t.text }]}
          value={value}
          onChangeText={(v) => { onChange(v); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search or type your major"
          placeholderTextColor={t.text3}
          autoCorrect={false}
          accessibilityLabel={label}
        />
        {value ? (
          <Pressable onPress={() => { onChange(''); setOpen(true); }} hitSlop={8} accessibilityLabel="Clear">
            <Ic name="x" size={15} color={t.text3} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {open && matches.length > 0 ? (
        <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
          {matches.map((s) => (
            <Pressable
              key={s}
              onPress={() => { onChange(s); setOpen(false); }}
              accessibilityRole="button"
              style={[styles.item, { borderBottomColor: t.border }]}
            >
              <Text style={[styles.itemText, { color: t.text }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, height: 48, borderWidth: 1.5, borderRadius: 13 },
  input: { flex: 1, fontSize: 15 },
  menu: { borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  item: { paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1 },
  itemText: { fontSize: 14.5 },
});
