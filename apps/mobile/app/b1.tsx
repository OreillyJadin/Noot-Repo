// B1 Search Results — ported from design_handoff_noot_app/app/screens-booking.jsx (B1).
// Live sort chips + a filter panel (price/availability) narrow the tutor list.
// Tapping a tutor saves it into the booking draft and opens B2.
// Live data: tutors come from api.tutors.search({}) mapped via toTutor.
//
// Filters apply to the list as they change, and every active one shows as a removable chip
// under the sort row. Previously the results array was hard-empty until you typed a query, so
// adjusting a filter appeared to do nothing at all — that was the "filters don't update the
// results" report, not a broken filter predicate.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Body, Card, Chip, Badge, Avatar, Button, H2, Label, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { nextFromWindows } from '../lib/availability';
import { VerifiedBadge } from '../lib/VerifiedBadge';
import { courseForQuery, searchTutors } from '../lib/browse';

type SortKey = 'best' | 'sessions' | 'price' | 'soon';
type AvailKey = 'any' | 'today' | 'week';

const SORTS: [SortKey, string][] = [
  ['best', 'Best match'],
  ['sessions', 'Most experienced'],
  ['price', 'Lowest price'],
  ['soon', 'Soonest'],
];
const AVAILS: [AvailKey, string][] = [
  ['any', 'Any time'],
  ['today', 'Today'],
  ['week', 'This week'],
];

const MIN_PRICE = 19;
const MAX_PRICE = 40;

type TutorWithAvail = Tutor & { availDayIndex: number; availLabel: string };

const SORTERS: Record<SortKey, (a: TutorWithAvail, b: TutorWithAvail) => number> = {
  best: (a, b) => b.rating * 10 - b.availDayIndex - (a.rating * 10 - a.availDayIndex),
  sessions: (a, b) => b.sessions - a.sessions,
  price: (a, b) => a.rate - b.rate,
  soon: (a, b) => a.availDayIndex - b.availDayIndex,
};


export default function B1() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patchBooking } = useApp();
  const { filters, q } = useLocalSearchParams<{ filters?: string; q?: string }>();
  // Live search query. Empty by default (no fabricated course); an optional ?q= seeds it
  // when another screen deep-links a specific course. Fully editable either way.
  const [query, setQuery] = useState((q ?? '').toString());

  // All approved tutors, fetched once. The visible list is derived by live-filtering this
  // set against `query` + the filter panel on the client — typing filters instantly with no
  // per-keystroke round-trip, and an empty query browses everyone rather than showing nothing.
  const [tutors, setTutors] = useState<Tutor[]>([]);
  // Real next-available per tutor: userId -> { dayIndex, label }, lazily filled for the
  // tutors actually shown (used for the "Next available" line + sorting).
  const [availById, setAvailById] = useState<Record<string, { dayIndex: number; label: string }>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.tutors
      .search({})
      .then((rows) => { if (active) setTutors(rows.map(toTutor)); })
      .catch(() => { if (active) setTutors([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const [sort, setSort] = useState<SortKey>('best');
  // Deep-linked from the browse screen's filter button (/b1?filters=1) → open the sheet.
  const [filterOpen, setFilterOpen] = useState(filters === '1');
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [avail, setAvail] = useState<AvailKey>('any');
  const clearFilters = () => {
    setMaxPrice(MAX_PRICE);
    setAvail('any');
  };
  // One entry per non-default filter, each able to clear just itself.
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(maxPrice < MAX_PRICE
      ? [{ key: 'price', label: `Under $${maxPrice}/hr`, clear: () => setMaxPrice(MAX_PRICE) }]
      : []),
    ...(avail !== 'any'
      ? [{
          key: 'avail',
          label: AVAILS.find(([v]) => v === avail)?.[1] ?? 'Availability',
          clear: () => setAvail('any'),
        }]
      : []),
  ];
  const activeFilters = activeChips.length;

  const trimmed = query.trim();
  // Tutors whose name or any course code matches the query. An EMPTY query now means
  // "everyone" rather than "nobody": the filter panel was previously inert because the list
  // it filters was hard-empty until you typed something, so changing price/availability
  // visibly did nothing. Browsing with filters only is a real way to search.
  const matched = useMemo(
    () => searchTutors(tutors, trimmed),
    [tutors, trimmed],
  );

  // Lazily load availability for the shown tutors — keyed on their ids so each is fetched
  // once and this never loops through the sort that reads availById back.
  const matchedIds = matched.map((tt) => tt.id).join(',');
  useEffect(() => {
    let active = true;
    matched.forEach((tt) => {
      if (availById[tt.id] !== undefined) return;
      api.tutors
        .getAvailability(tt.id)
        .then((windows) => { if (active) setAvailById((prev) => ({ ...prev, [tt.id]: nextFromWindows(windows) })); })
        .catch(() => {});
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIds]);

  const withAvail: TutorWithAvail[] = matched.map((tt) => {
    const a = availById[tt.id];
    return { ...tt, availDayIndex: a?.dayIndex ?? 99, availLabel: a?.label ?? 'Checking availability…' };
  });
  const filtered = withAvail.filter(
    (tt) =>
      // At the top of the stepper there is no cap: rates run past MAX_PRICE, and the default
      // used to hide every tutor above it with no filter chip to explain why.
      (maxPrice >= MAX_PRICE || tt.rate <= maxPrice) &&
      (avail === 'any' || (avail === 'today' && tt.availDayIndex === 0) || (avail === 'week' && tt.availDayIndex <= 6)),
  );
  const list = [...filtered].sort(SORTERS[sort]);

  const open = (tutor: Tutor) => {
    patchBooking({ tutor, course: courseForQuery(tutor, trimmed) });
    router.push('/b2');
  };

  return (
    <Screen>
      <View style={[styles.topBar, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
        <View style={styles.searchRow}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ic name="back" size={24} color={t.accent} strokeWidth={2.4} />
          </Pressable>
          <View style={[styles.searchField, { backgroundColor: t.surface, borderColor: t.borderStrong }]}>
            <Ic name="search" size={17} color={t.text3} strokeWidth={1.8} />
            <TextInput
              style={[styles.searchInput, { color: t.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search a course or tutor"
              placeholderTextColor={t.text3}
              // Don't steal focus when the user arrived to work the filter panel — popping
              // the keyboard over the results is the "interrupts the search" complaint.
              autoFocus={!trimmed && filters !== '1'}
              autoCorrect={false}
              // Matching is case-insensitive (searchTutors lowercases both sides), so forcing
              // ALL CAPS only made typing a tutor's name feel broken.
              autoCapitalize="none"
              returnKeyType="search"
              submitBehavior="blurAndSubmit"
              clearButtonMode="never"
              accessibilityLabel="Search tutors by course or name"
            />
            {trimmed ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ic name="x" size={16} color={t.text3} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.sortBar}>
        {/* keyboardShouldPersistTaps: without it the first tap on a sort chip only dismisses
            the keyboard (the results list already persists taps) — the inconsistency users hit. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortScroll}
          keyboardShouldPersistTaps="handled"
        >
          {SORTS.map(([k, l]) => (
            <Chip key={k} label={l} on={sort === k} onPress={() => setSort(k)} />
          ))}
        </ScrollView>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={[
            styles.filterBtn,
            { borderColor: t.borderStrong, backgroundColor: activeFilters ? t.accent : t.surface },
          ]}
        >
          <Ic name="filter" size={15} color={activeFilters ? t.onAccent : t.text} strokeWidth={1.8} />
          <Text style={{ color: activeFilters ? t.onAccent : t.text, fontSize: 13, fontWeight: '600' }}>
            Filters{activeFilters ? ` · ${activeFilters}` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Active filters as individually removable chips. The panel itself is a modal, so
          while it's open you can't watch the list change behind it — these keep every active
          filter visible and undoable from the results screen, one tap each. */}
      {activeChips.length > 0 ? (
        <View style={styles.activeBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeScroll}
            keyboardShouldPersistTaps="handled"
          >
            {activeChips.map((c) => (
              <Pressable
                key={c.key}
                onPress={c.clear}
                accessibilityRole="button"
                accessibilityLabel={`Remove filter ${c.label}`}
                style={[styles.activeChip, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}
              >
                <Text style={[styles.activeChipLabel, { color: t.accent }]}>{c.label}</Text>
                <Ic name="x" size={12} color={t.accent} strokeWidth={2.6} />
              </Pressable>
            ))}
            <Pressable onPress={clearFilters} accessibilityRole="button" style={styles.clearAll} hitSlop={6}>
              <Text style={[styles.clearAllLabel, { color: t.text3 }]}>Clear all</Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      <Body pad={16} contentStyle={{ paddingTop: 4 }}>
        {!loading ? (
          <Text style={{ fontSize: 13, color: t.text3, marginBottom: 12 }}>
            <Text style={{ color: t.text2, fontWeight: '700' }}>{list.length}</Text> tutor
            {list.length !== 1 ? 's' : ''}
            {trimmed ? ` for “${trimmed}”` : activeChips.length ? ' match your filters' : ' available'}
          </Text>
        ) : null}

        <View style={{ gap: 10 }}>
          {list.map((tt) => (
            <Card key={tt.id} onPress={() => open(tt)} style={styles.tutorCard}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Avatar size={56} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowBetween}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{tt.name}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>
                      ${tt.rate}
                      <Text style={{ fontSize: 11, color: t.text3, fontWeight: '500' }}>/hr</Text>
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: t.text3, marginTop: 1 }}>
                    {tt.year} · {tt.major}
                  </Text>
                  <View style={styles.rowGap6}>
                    <Ic name="cap" size={15} color={t.text3} strokeWidth={1.7} />
                    <Text style={{ fontSize: 13, color: t.text2 }}>
                      <Text style={{ color: t.text, fontWeight: '600' }}>{tt.sessions}</Text> sessions completed
                    </Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <VerifiedBadge verified={tt.verified} />
                    {courseForQuery(tt, trimmed) ? <Badge label={courseForQuery(tt, trimmed)} tone="accentSoft" /> : null}
                  </View>
                </View>
              </View>
              <View style={[styles.nextRow, { borderTopColor: t.border }]}>
                <Ic name="clock" size={15} color={t.good} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, color: t.text2 }}>
                  Next available: <Text style={{ color: t.text, fontWeight: '600' }}>{tt.availLabel}</Text>
                </Text>
                <View style={{ marginLeft: 'auto' }}>
                  <Ic name="chevron" size={15} color={t.text3} strokeWidth={2} />
                </View>
              </View>
            </Card>
          ))}

          {list.length === 0 && (
            <View style={styles.empty}>
              <Ic name="search" size={28} color={t.text3} strokeWidth={1.6} />
              <Text style={{ marginTop: 10, fontSize: 15, color: t.text3, textAlign: 'center' }}>
                {loading
                  ? 'Loading tutors…'
                  : trimmed
                    ? `No tutors found for “${trimmed}”.`
                    : activeFilters
                      ? 'No tutors match these filters. Try removing one.'
                      : 'No tutors are available yet.'}
              </Text>
            </View>
          )}
        </View>
      </Body>

      <BottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label="Reset"
              kind="secondary"
              size="md"
              style={{ flex: 1 }}
              onPress={clearFilters}
            />
            <Button
              label={`Show ${list.length} tutors`}
              kind="primary"
              size="md"
              style={{ flex: 1.8 }}
              onPress={() => setFilterOpen(false)}
            />
          </View>
        }
      >
        <FilterGroup label={maxPrice < MAX_PRICE ? `Max price · $${maxPrice}/hr` : 'Max price · Any'}>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setMaxPrice((p) => Math.max(MIN_PRICE, p - 3))}
              style={[styles.stepBtn, { borderColor: t.borderStrong }]}
            >
              <Ic name="minus" size={16} color={t.text} strokeWidth={2.2} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: t.text }}>
              {maxPrice < MAX_PRICE ? `$${maxPrice}/hr` : 'Any price'}
            </Text>
            <Pressable
              onPress={() => setMaxPrice((p) => Math.min(MAX_PRICE, p + 3))}
              style={[styles.stepBtn, { borderColor: t.borderStrong }]}
            >
              <Ic name="plus" size={16} color={t.text} strokeWidth={2.2} />
            </Pressable>
          </View>
        </FilterGroup>

        <FilterGroup label="Availability">
          <View style={styles.chipWrap}>
            {AVAILS.map(([v, l]) => (
              <Chip key={v} label={l} on={avail === v} onPress={() => setAvail(v)} />
            ))}
          </View>
        </FilterGroup>
      </BottomSheet>
    </Screen>
  );
}

// ── local helpers (used only by this screen) ───────────────────────────────
function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.sheetScrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.surface }]}>
          <View style={styles.sheetHandleWrap}>
            <View style={[styles.sheetHandle, { backgroundColor: t.borderStrong }]} />
          </View>
          <View style={styles.sheetHeader}>
            <H2 style={{ fontSize: 19 }}>{title}</H2>
            <Pressable onPress={onClose} style={[styles.sheetClose, { backgroundColor: t.surface2 }]} hitSlop={8}>
              <Ic name="x" size={16} color={t.text2} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.sheetFooter, { borderTopColor: t.border, paddingBottom: insets.bottom + 12 }]}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function FilterGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 20 }}>
      <Label>{label}</Label>
      {children}
      {hint ? <Text style={{ fontSize: 12, color: t.text3, marginTop: 8 }}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: 16, zIndex: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', padding: 0 },
  sortBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  activeBar: { paddingHorizontal: 16, paddingBottom: 6 },
  activeScroll: { gap: 6, alignItems: 'center', paddingRight: 4 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  activeChipLabel: { fontSize: 12.5, fontWeight: '600' },
  clearAll: { paddingHorizontal: 8, paddingVertical: 6 },
  clearAllLabel: { fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
  sortScroll: { flexDirection: 'row', gap: 7, flexGrow: 1 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  tutorCard: { padding: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowGap6: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 9, flexWrap: 'wrap' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11, paddingTop: 11, borderTopWidth: 1 },
  empty: { alignItems: 'center', padding: 40 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '82%' },
  sheetHandleWrap: { paddingTop: 10, paddingBottom: 4, alignItems: 'center' },
  sheetHandle: { width: 38, height: 5, borderRadius: 3 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sheetClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { paddingHorizontal: 20 },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
});
