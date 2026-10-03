// Course picker backed by the real UA catalog (`courses`, ~3.9k rows).
//
// Course codes used to be free text in two places — the student's "My courses" and the tutor's
// course list — each doing `draft.trim().toUpperCase()` and storing whatever came out. So
// "MATH125", "Math 125" and "MTH 125" were all storable, none matched each other, and a
// student's course could never match a tutor's because nothing forced them to be the same
// string. Matching is the whole product, so the codes have to come from one source.
//
// You can only add a course that exists in the catalog. Search hits code, title and subject,
// so "calc", "MATH 125" and "mathematics" all land — you don't have to know the code.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { api, type CatalogCourse } from '@noot/core';
import { Ic, useTheme } from '@noot/ui';

export interface CoursePickerProps {
  /** Course codes already chosen — shown as "Added" and not selectable twice. */
  selected: string[];
  onSelect: (course: CatalogCourse) => void;
  label?: string;
  placeholder?: string;
  /** Leave the search and its results up after a pick, so several courses can be added in a
   *  row from one search (ERR-004). Default: the search clears after each pick. */
  keepOpen?: boolean;
}

export function CoursePicker({
  selected,
  onSelect,
  label = 'Add a course',
  placeholder = 'Search e.g. MATH 125, calculus, chemistry',
  keepOpen = false,
}: CoursePickerProps) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  // Guards against an earlier, slower request landing after a later one and showing
  // results for a query the user has already typed past.
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    // Debounced: 3.9k rows behind an ilike, and typing "chem" shouldn't fire four queries.
    const id = setTimeout(() => {
      api.courses
        .search(q, 20)
        .then((rows) => { if (seq.current === mine) setResults(rows); })
        .catch(() => { if (seq.current === mine) setResults([]); })
        .finally(() => { if (seq.current === mine) setLoading(false); });
    }, 220);
    return () => clearTimeout(id);
  }, [query]);

  const pick = (c: CatalogCourse) => {
    onSelect(c);
    if (keepOpen) return;
    setQuery('');
    setResults([]);
  };

  const q = query.trim();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.text2 }]}>{label}</Text> : null}
      <View style={[styles.field, { backgroundColor: t.surface, borderColor: t.borderStrong }]}>
        <Ic name="search" size={17} color={t.text3} strokeWidth={1.8} />
        <TextInput
          style={[styles.input, { color: t.text }]}
          value={query}
          onChangeText={(v) => { setQuery(v); setTouched(true); }}
          placeholder={placeholder}
          placeholderTextColor={t.text3}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search the course catalog"
        />
        {loading ? <ActivityIndicator size="small" color={t.text3} /> : null}
        {q && !loading ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear">
            <Ic name="x" size={15} color={t.text3} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {q.length >= 2 ? (
        <View style={[styles.results, { backgroundColor: t.surface, borderColor: t.border }]}>
          {results.map((c) => {
            const already = selected.includes(c.courseCode);
            return (
              <Pressable
                key={c.courseCode}
                onPress={() => !already && pick(c)}
                disabled={already}
                accessibilityRole="button"
                accessibilityLabel={`${c.courseCode} ${c.courseTitle}${already ? ', already added' : ''}`}
                style={[styles.result, { borderBottomColor: t.border, opacity: already ? 0.45 : 1 }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.code, { color: t.text }]}>{c.courseCode}</Text>
                  <Text numberOfLines={1} style={[styles.title, { color: t.text3 }]}>
                    {c.courseTitle}
                    {c.creditHours ? ` · ${c.creditHours} hr` : ''}
                  </Text>
                </View>
                {already ? (
                  <Text style={[styles.added, { color: t.text3 }]}>Added</Text>
                ) : (
                  <Ic name="plus" size={16} color={t.accent} strokeWidth={2.2} />
                )}
              </Pressable>
            );
          })}
          {!loading && results.length === 0 ? (
            <Text style={[styles.empty, { color: t.text3 }]}>
              No course matches “{q}”. Try the subject, like “math”.
            </Text>
          ) : null}
        </View>
      ) : touched && q.length === 1 ? (
        <Text style={[styles.hint, { color: t.text3 }]}>Keep typing — at least 2 characters.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, height: 48, borderWidth: 1.5, borderRadius: 13 },
  input: { flex: 1, fontSize: 15 },
  results: { borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1 },
  code: { fontSize: 14.5, fontWeight: '700' },
  title: { fontSize: 12, marginTop: 1 },
  added: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 13, padding: 14, textAlign: 'center' },
  hint: { fontSize: 12, paddingHorizontal: 2 },
});
