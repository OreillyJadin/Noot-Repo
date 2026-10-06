// S3 Search / Browse — ported from screens-student.jsx (StudentHome). Browse-first
// hub into the booking flow: tappable search bar + category tabs → tutor cards that open
// the tutor profile (B2). One live fetch of the approved tutors (api.tutors.search); what
// each tab shows is decided in lib/browse.ts:
//   • For you — a carousel picked for the student (their courses, else their major) above
//     the popular list (ERR-010);
//   • a tab per category that has tutors (ERR-011).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, Ic, H2, Muted, TabBar, Skeleton, EmptyState, useTheme } from '@noot/ui';
import { api, type CatalogCourse } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { useCourseSuggestions } from '../lib/useCourseSuggestions';
import { VerifiedBadge } from '../lib/VerifiedBadge';
import { byPopularity, forYou, populatedCategories, tutorsIn } from '../lib/browse';

function courseFor(tutor: Tutor): string {
  return tutor.courses[0]?.[0] ?? '';
}

/** True if the tutor's name or any course code contains the (trimmed) query.
 *  Case-insensitive so "mgt" matches "MGT 300". */
function tutorMatches(tutor: Tutor, query: string): boolean {
  const q = query.toLowerCase();
  if (tutor.name.toLowerCase().includes(q)) return true;
  return tutor.courses.some(([code]) => code.toLowerCase().includes(q));
}

/** The course to attribute to a tutor for the query — the matched course code if the
 *  query hit one, else the tutor's first course. */
function matchCourse(tutor: Tutor, query: string): string {
  const q = query.toLowerCase();
  const codes = tutor.courses.map(([code]) => code);
  return (q && codes.find((c) => c.toLowerCase().includes(q))) || codes[0] || '';
}

// ── local helper (used only by this screen) ─────────────────────────────────
function TutorRow({ tutor, onPress, course }: { tutor: Tutor; onPress: () => void; course?: string }) {
  const t = useTheme();
  const badgeCourse = course ?? courseFor(tutor);
  return (
    <Card onPress={onPress} style={styles.rowCard}>
      <View style={styles.rowInner}>
        <Avatar size={46} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowName, { color: t.text }]}>{tutor.name}</Text>
            <Text style={[styles.rowRate, { color: t.text }]}>
              ${tutor.rate}
              <Text style={[styles.rowRateUnit, { color: t.text3 }]}>/hr</Text>
            </Text>
          </View>
          <Text style={[styles.rowMeta, { color: t.text3 }]}>
            {tutor.year} · {tutor.major}
          </Text>
          <View style={styles.rowFoot}>
            {badgeCourse ? <Badge label={badgeCourse} tone="accentSoft" /> : null}
            <VerifiedBadge verified={tutor.verified} />
            <Text style={[styles.rowSessions, { color: t.text3 }]}>{tutor.sessions} sessions</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function StudentHome() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patchBooking, role } = useApp();
  const { me, loading: meLoading } = useMe();
  const [tab, setTab] = useState(0);

  // Live search query. When non-empty, the browse view (category tabs + carousel) is
  // replaced by tutors matching the query by name or course code — typing filters
  // instantly, no per-keystroke round-trip and no fabricated default course.
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const suggestions = useCourseSuggestions(trimmed);
  // All approved tutors, fetched once, filtered client-side against `query`.
  const [allTutors, setAllTutors] = useState<Tutor[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.tutors
      .search({})
      .then((list) => { if (active) setAllTutors(list.map(toTutor)); })
      .catch(() => { if (active) setAllTutors([]); })
      .finally(() => { if (active) setAllLoading(false); });
    return () => { active = false; };
  }, []);
  const results = trimmed ? allTutors.filter((tt) => tutorMatches(tt, trimmed)) : [];

  // Tab 0 is "For you"; the rest are the categories some tutor actually teaches in.
  const categories = populatedCategories(allTutors);
  // A tab can vanish (its last tutor left): fall back to "For you" rather than select nothing.
  const tabIndex = tab <= categories.length ? tab : 0;
  const category = tabIndex > 0 ? categories[tabIndex - 1] : undefined;
  const picked = category ? null : forYou(allTutors, me?.courses ?? [], me?.major ?? null);
  // The list under the tabs: that category's tutors, or everyone by popularity.
  const rows = category
    ? tutorsIn(allTutors, category)
    : byPopularity(allTutors).map((tutor) => ({ tutor, course: courseFor(tutor) }));
  const loading = allLoading;

  const openSearch = () => router.push('/b1');
  const openTutor = (tutor: Tutor, course?: string) => {
    patchBooking({ tutor, course: course ?? courseFor(tutor) });
    router.push('/b2');
  };
  const scrollRef = useRef<ScrollView>(null);
  // Re-tapping the Search tab clears the search + category filter and scrolls up.
  const { active, onTab } = useTabNav({ scrollRef, onReselect: () => { setTab(0); setQuery(''); } });

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Muted style={styles.welcome}>Welcome back</Muted>
            {meLoading ? <Skeleton width={140} height={24} /> : <H2 style={styles.name}>Hey, {firstName(me, 'there')}</H2>}
          </View>
          <Pressable onPress={() => router.push('/profile')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Your profile">
            <Avatar size={40} />
          </Pressable>
        </View>

        {/* Live search input — filters tutors by name/course as you type. The sliders
            button opens B1 with its filter sheet (price / availability). */}
        <View style={styles.searchRow}>
          <View style={[styles.searchField, { backgroundColor: t.surface, borderColor: t.borderStrong }]}>
            <Ic name="search" size={18} color={t.text3} strokeWidth={1.8} />
            <TextInput
              style={[styles.searchInput, { color: t.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder="What class? e.g. MGT 300 or calculus"
              placeholderTextColor={t.text3}
              autoCorrect={false}
              // Course codes match case-insensitively, and forcing caps made typing a
              // course NAME ("calculus") or a tutor's name feel broken.
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search tutors by course or name"
            />
            {trimmed ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ic name="x" size={16} color={t.text3} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => router.push('/b1?filters=1')}
            style={[styles.filterBtn, { backgroundColor: t.surface, borderColor: t.borderStrong }]}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            hitSlop={6}
          >
            <Ic name="sliders" size={20} color={t.accent} strokeWidth={1.8} />
          </Pressable>
        </View>

        {suggestions.length > 0 ? (
          <View style={[styles.suggestions, { backgroundColor: t.surface, borderColor: t.border }]}>
            {suggestions.map((c: CatalogCourse) => (
              <Pressable
                key={c.courseCode}
                onPress={() => setQuery(c.courseCode)}
                accessibilityRole="button"
                accessibilityLabel={`Search ${c.courseCode} ${c.courseTitle}`}
                style={[styles.suggestion, { borderBottomColor: t.border }]}
              >
                <Ic name="cap" size={15} color={t.accent} strokeWidth={1.8} />
                <Text style={[styles.suggestionCode, { color: t.text }]}>{c.courseCode}</Text>
                <Text numberOfLines={1} style={[styles.suggestionTitle, { color: t.text3 }]}>{c.courseTitle}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {trimmed ? (
        <Body ref={scrollRef} pad={0} contentStyle={styles.bodyContent}>
          <View style={[styles.sectionHead, styles.resultsHead]}>
            <Text style={[styles.resultsCount, { color: t.text3 }]}>
              <Text style={{ color: t.text2, fontWeight: '700' }}>{results.length}</Text> tutor
              {results.length !== 1 ? 's' : ''} for “{trimmed}”
            </Text>
          </View>
          <View style={styles.list}>
            {allLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={72} radius={14} />
                <Skeleton height={72} radius={14} />
                <Skeleton height={72} radius={14} />
              </View>
            ) : results.length === 0 ? (
              <EmptyState icon="search" title="No tutors found" subtitle={`No tutors match “${trimmed}”. Try a course code or name.`} />
            ) : (
              results.map((tutor) => (
                <TutorRow
                  key={tutor.id}
                  tutor={tutor}
                  course={matchCourse(tutor, trimmed)}
                  onPress={() => openTutor(tutor, matchCourse(tutor, trimmed))}
                />
              ))
            )}
          </View>
        </Body>
      ) : (
        <>
      <View style={[styles.tabsWrap, { borderBottomColor: t.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          contentContainerStyle={styles.tabs}
        >
          {['For you', ...categories.map((c) => c.name)].map((c, i) => {
            const on = i === tabIndex;
            return (
              <Pressable
                key={c}
                onPress={() => setTab(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tabItem, { borderBottomColor: on ? t.accent : 'transparent' }]}
              >
                <Text style={[styles.tabLabel, { color: on ? t.accent : t.text3, fontWeight: on ? '700' : '500' }]}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Body ref={scrollRef} pad={0} contentStyle={styles.bodyContent}>
        {picked ? (
          <>
            <View style={styles.sectionHead}>
              <H2 style={styles.sectionTitle}>{picked.title}</H2>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {picked.picks.map(({ tutor, course }) => (
                <Card key={tutor.id} onPress={() => openTutor(tutor, course)} style={styles.miniCard}>
                  <Avatar size={40} />
                  <Text style={[styles.miniName, { color: t.text }]}>{tutor.name}</Text>
                  {course ? <Badge label={course} tone="accentSoft" /> : null}
                  {tutor.verified ? (
                    <View style={styles.miniVerified}>
                      <Ic name="check" size={13} color={t.good} strokeWidth={2.6} />
                      <Text style={[styles.miniVerifiedLabel, { color: t.good }]}>Verified</Text>
                    </View>
                  ) : null}
                </Card>
              ))}
            </ScrollView>
          </>
        ) : null}

        <View style={[styles.sectionHead, picked ? styles.sectionHeadSpaced : null]}>
          <H2 style={styles.sectionTitle}>{category ? `Top in ${category.name}` : 'Most popular'}</H2>
          <Text onPress={openSearch} style={[styles.seeAll, { color: t.accent }]}>
            See all
          </Text>
        </View>
        <View style={styles.list}>
          {loading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={72} radius={14} />
              <Skeleton height={72} radius={14} />
              <Skeleton height={72} radius={14} />
            </View>
          ) : rows.length === 0 ? (
            <EmptyState icon="search" title="No tutors yet" subtitle="Tutors for your courses will show up here soon." />
          ) : (
            rows.map(({ tutor, course }) => (
              <TutorRow key={tutor.id} tutor={tutor} course={course} onPress={() => openTutor(tutor, course)} />
            ))
          )}
        </View>
      </Body>
        </>
      )}

      <TabBar active={active} role={role} onTab={onTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 6, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestions: { marginTop: 8, borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  suggestionCode: { fontSize: 13.5, fontWeight: '700' },
  suggestionTitle: { flex: 1, fontSize: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  filterBtn: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  welcome: { fontSize: 13 },
  name: { fontSize: 22 },
  tabsWrap: { borderBottomWidth: 1 },
  tabs: { flexDirection: 'row', gap: 18, paddingHorizontal: 20 },
  tabItem: { paddingBottom: 10, borderBottomWidth: 2 },
  tabLabel: { fontSize: 15 },
  bodyContent: { paddingTop: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingBottom: 10 },
  resultsHead: { paddingTop: 4 },
  resultsCount: { fontSize: 13 },
  sectionHeadSpaced: { paddingTop: 20 },
  sectionTitle: { fontSize: 18 },
  seeAll: { fontSize: 14, fontWeight: '600' },
  carousel: { gap: 12, paddingHorizontal: 20, paddingVertical: 2 },
  miniCard: { width: 132, padding: 14, gap: 10 },
  miniName: { fontSize: 15, fontWeight: '600' },
  miniVerified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniVerifiedLabel: { fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  listNote: { paddingVertical: 20, textAlign: 'center' },
  rowCard: { padding: 12 },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowRate: { fontSize: 15, fontWeight: '700' },
  rowRateUnit: { fontSize: 11, fontWeight: '500' },
  rowMeta: { fontSize: 13, marginTop: 2 },
  rowFoot: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 },
  rowSessions: { fontSize: 12, marginLeft: 'auto' },
});
