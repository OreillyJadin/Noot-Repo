// S3 Search / Browse — ported from screens-student.jsx (StudentHome). Browse-first
// hub into the booking flow: tappable search bar + category tabs → tutor cards that open
// the tutor profile (B2). One live fetch of the approved tutors (api.tutors.search); what
// each tab shows is decided in lib/browse.ts:
//   • For you — a carousel picked for the student (their courses, else their major) above
//     the popular list (ERR-010);
//   • a tab per category that has tutors (ERR-011).
import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Body, BandHeader, ListSection, Avatar, Ic, H2, TabBar, Skeleton, EmptyState, useTheme, useLargeText } from '@noot/ui';
import { api, type CatalogCourse } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { useMe } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { useCourseSuggestions } from '../lib/useCourseSuggestions';
import { VERIFIED_EXPLAINER } from '../lib/VerifiedBadge';
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
  const large = useLargeText();
  const details = [tutor.year, `${tutor.sessions} ${tutor.sessions === 1 ? 'session' : 'sessions'}`].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tutor.name}, ${badgeCourse}, $${tutor.rate} per hour`}
      style={({ pressed }) => [styles.rowInner, pressed && { backgroundColor: t.surface2 }]}
    >
        {large ? null : <Avatar size={44} uri={tutor.avatarUrl} />}
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <View style={styles.rowNameWrap}>
              <Text style={[styles.rowName, { color: t.text }]}>{tutor.name}</Text>
              {tutor.verified ? (
                <Pressable
                  onPress={() => Alert.alert('Verified tutor', VERIFIED_EXPLAINER)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Verified tutor. Tap for what this means."
                >
                  <Ic name="check" size={14} color={t.good} strokeWidth={2.6} />
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.rowRate, { color: t.text }]}>
              ${tutor.rate}
              <Text style={[styles.rowRateUnit, { color: t.text3 }]}>/hr</Text>
            </Text>
          </View>
          <View style={styles.rowMetaLine}>
            {badgeCourse ? <Text style={[styles.rowCourse, { color: t.accent }]}>{badgeCourse}</Text> : null}
            {badgeCourse && details ? <Text style={{ color: t.text2 }}> · </Text> : null}
            {details ? <Text style={[styles.rowMeta, { color: t.text2 }]}>{details}</Text> : null}
          </View>
        </View>
    </Pressable>
  );
}

export default function StudentHome() {
  const t = useTheme();
  const largeText = useLargeText();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  const { me } = useMe();
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
      <Body
        header={
          <BandHeader
            title="Find a tutor"
            trailing={
              <Pressable onPress={() => router.push('/profile')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Your profile">
                <View style={[styles.profileRing, { borderColor: t.onBand }]}>
                  <Avatar size={40} uri={me?.avatarUrl} />
                </View>
              </Pressable>
            }
          >
            <View style={[styles.searchField, { backgroundColor: t.surface }]}>
              <Ic name="search" size={18} color={t.text3} strokeWidth={1.8} />
              <TextInput
                style={[styles.searchInput, { color: t.text }]}
                value={query}
                onChangeText={setQuery}
                placeholder={largeText ? 'Search' : 'Course or tutor'}
                placeholderTextColor={t.text3}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search tutors by course or name"
              />
              {trimmed ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Ic name="x" size={16} color={t.text3} strokeWidth={2} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => router.push('/b1?filters=1')}
                accessibilityRole="button"
                accessibilityLabel="Filters"
                hitSlop={6}
                style={styles.filterBtn}
              >
                <Ic name="sliders" size={20} color={t.onBand} strokeWidth={1.8} />
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
          </BandHeader>
        }
        refreshTint={t.onBand}
        ref={scrollRef}
        pad={0}
        contentStyle={styles.bodyContent}
      >
        {trimmed ? (
          <>
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
              <ListSection>
                {results.map((tutor) => (
                  <TutorRow
                    key={tutor.id}
                    tutor={tutor}
                    course={matchCourse(tutor, trimmed)}
                    onPress={() => openTutor(tutor, matchCourse(tutor, trimmed))}
                  />
                ))}
              </ListSection>
            )}
          </View>
          </>
        ) : (
          <>
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
                    style={[styles.tabItem, { backgroundColor: on ? t.accentWeak : 'transparent' }]}
                  >
                    <Text style={[styles.tabLabel, { color: on ? t.accent : t.text2, fontWeight: on ? '600' : '500' }]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {picked ? (
              <View style={styles.courseSection}>
                <H2 style={styles.sectionTitle}>{picked.title}</H2>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                  {picked.picks.map(({ tutor, course }) => (
                    <Pressable
                      key={tutor.id}
                      onPress={() => openTutor(tutor, course)}
                      accessibilityRole="button"
                      accessibilityLabel={`Find ${tutor.name} for ${course}`}
                      style={styles.miniItem}
                    >
                      <Avatar size={60} uri={tutor.avatarUrl} />
                      <Text numberOfLines={1} style={[styles.miniName, { color: t.text }]}>{tutor.name.split(' ')[0]}</Text>
                      {course ? <Text numberOfLines={1} style={[styles.miniCourse, { color: t.accent }]}>{course}</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.popularSection}>
              <View style={styles.sectionHead}>
                <H2 style={styles.sectionTitle}>{category ? `Top in ${category.name}` : 'Popular'}</H2>
                <Pressable onPress={openSearch} accessibilityRole="button" accessibilityLabel="See all tutors">
                  <Text style={[styles.seeAll, { color: t.accent }]}>See all</Text>
                </Pressable>
              </View>
              <View style={styles.list}>
                {loading ? (
                  <View style={styles.skeletons}>
                    <Skeleton height={72} radius={14} />
                    <Skeleton height={72} radius={14} />
                    <Skeleton height={72} radius={14} />
                  </View>
                ) : rows.length === 0 ? (
                  <EmptyState icon="search" title="No tutors yet" subtitle="Tutors for your courses will show up here soon." />
                ) : (
                  <ListSection>
                    {rows.map(({ tutor, course }) => (
                      <TutorRow key={tutor.id} tutor={tutor} course={course} onPress={() => openTutor(tutor, course)} />
                    ))}
                  </ListSection>
                )}
              </View>
            </View>
          </>
        )}
      </Body>

      <TabBar active={active} role={role} onTab={onTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, padding: 1, alignItems: 'center', justifyContent: 'center' },
  suggestions: { marginTop: 8, borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  suggestionCode: { fontSize: 13.5, fontWeight: '700' },
  suggestionTitle: { flex: 1, fontSize: 12 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingLeft: 14, paddingRight: 8, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  filterBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  bodyContent: { paddingTop: 16, paddingBottom: 18, gap: 18 },
  list: { paddingHorizontal: 20, gap: 10 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, alignItems: 'center' },
  tabItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  tabLabel: { fontSize: 15 },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingBottom: 10 },
  resultsHead: { paddingTop: 4 },
  resultsCount: { fontSize: 13 },
  sectionTitle: { fontSize: 18 },
  seeAll: { fontSize: 14, fontWeight: '600' },
  courseSection: { gap: 10, paddingHorizontal: 20 },
  carousel: { gap: 20, paddingVertical: 2 },
  miniItem: { width: 72, alignItems: 'center', gap: 3 },
  miniName: { fontSize: 14, textAlign: 'center' },
  miniCourse: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  popularSection: { gap: 0 },
  skeletons: { gap: 10 },
  rowInner: { minHeight: 72, flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowRate: { fontSize: 15, fontWeight: '700' },
  rowRateUnit: { fontSize: 11, fontWeight: '500' },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  rowCourse: { fontSize: 13, fontWeight: '600' },
  rowMeta: { fontSize: 13 },
});
