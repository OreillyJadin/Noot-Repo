// Major picker backed by the UA undergraduate majors list (@noot/core UA_MAJORS, tracker ST1).
//
// The old field had a search icon but was a plain text box, so "CS", "Comp Sci" and
// "Computer Science" were all storable. You can now only pick a real major. Searching is
// local (92 entries, no network). Used by student signup (student_profile) and tutor step 2 (t2).
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { searchMajors } from '@noot/core';
import { Ic, useTheme } from '@noot/ui';

export interface MajorPickerProps {
  value: string;
  onChange: (major: string) => void;
  label?: string;
}

export function MajorPicker({ value, onChange, label = 'Major' }: MajorPickerProps) {
  const t = useTheme();
  // The search box shows when there's no major yet or the user tapped "Change". Derived
  // rather than initialised from `value`, which arrives after the screen prefills.
  const [changing, setChanging] = useState(false);
  const editing = changing || !value;
  const [query, setQuery] = useState('');
  const results = searchMajors(query);
  const q = query.trim();

  const pick = (name: string) => {
    onChange(name);
    setQuery('');
    setChanging(false);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.text2 }]}>{label}</Text> : null}
      {!editing ? (
        <Pressable
          onPress={() => setChanging(true)}
          accessibilityRole="button"
          accessibilityLabel={`Major: ${value}. Tap to change`}
          style={[styles.field, { backgroundColor: t.surface, borderColor: t.borderStrong }]}
        >
          <Text style={[styles.input, { color: t.text }]}>{value}</Text>
          <Text style={[styles.change, { color: t.accent }]}>Change</Text>
        </Pressable>
      ) : (
        <View style={[styles.field, { backgroundColor: t.surface, borderColor: t.borderStrong }]}>
          <Ic name="search" size={17} color={t.text3} strokeWidth={1.8} />
          <TextInput
            style={[styles.input, { color: t.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search UA majors…"
            placeholderTextColor={t.text3}
            autoCorrect={false}
            autoFocus={changing}
            returnKeyType="search"
            accessibilityLabel="Search UA majors"
          />
          {q || value ? (
            <Pressable
              onPress={() => { setQuery(''); if (value) setChanging(false); }}
              hitSlop={8}
              accessibilityLabel={value ? 'Cancel' : 'Clear'}
            >
              <Ic name="x" size={15} color={t.text3} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      )}

      {editing && q ? (
        <View style={[styles.results, { backgroundColor: t.surface, borderColor: t.border }]}>
          {results.map((m) => (
            <Pressable
              key={m.name}
              onPress={() => pick(m.name)}
              accessibilityRole="button"
              accessibilityLabel={m.name}
              style={[styles.result, { borderBottomColor: t.border }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: t.text }]}>{m.name}</Text>
                {m.college ? (
                  <Text numberOfLines={1} style={[styles.college, { color: t.text3 }]}>{m.college}</Text>
                ) : null}
              </View>
              {m.name === value ? <Ic name="check" size={16} color={t.accent} strokeWidth={2.4} /> : null}
            </Pressable>
          ))}
          {results.length === 0 ? (
            <Text style={[styles.empty, { color: t.text3 }]}>No UA major matches “{q}”.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, height: 48, borderWidth: 1.5, borderRadius: 13 },
  input: { flex: 1, fontSize: 15 },
  change: { fontSize: 13, fontWeight: '600' },
  results: { borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1 },
  name: { fontSize: 14.5, fontWeight: '600' },
  college: { fontSize: 12, marginTop: 1 },
  empty: { fontSize: 13, padding: 14, textAlign: 'center' },
});
