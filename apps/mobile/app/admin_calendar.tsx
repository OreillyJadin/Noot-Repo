import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, type AdminCalendarEvent } from '@noot/core';
import { Body, EmptyState, Ic, Screen, Skeleton, TabBar, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminLargeHeader, AdminRow, AdminSection, CalendarEventRow, eventColor, eventMuted } from '../lib/adminUi';
import { dayKey, groupByDay, monthMatrix, monthRange } from '../lib/monthGrid';
import { useTabNav } from '../lib/useTabNav';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
type ViewMode = 'month' | 'week';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function weekDates(date: Date): Date[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function AdminCalendarScreen() {
  const t = useTheme();
  const router = useRouter();
  const bodyRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef: bodyRef });
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [today, setToday] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(firstOfMonth(today));
  const [mode, setMode] = useState<ViewMode>('month');
  const cache = useRef<Record<string, AdminCalendarEvent[]>>({});
  const gen = useRef<Record<string, number>>({});
  const visibleMonthRef = useRef(visibleMonth);
  const [calendarCache, setCalendarCache] = useState<Record<string, AdminCalendarEvent[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const loadMonth = useCallback(async (date: Date, force = false) => {
    const key = monthKey(date);
    if (!force && cache.current[key]) return;
    const generation = (gen.current[key] ?? 0) + 1;
    gen.current[key] = generation;
    setLoadingKey(key);
    setErrorKey((current) => current === key ? null : current);
    const range = monthRange(date.getFullYear(), date.getMonth());
    try {
      const events = await api.admin.calendar(range.fromIso, range.toIso);
      if (gen.current[key] !== generation) return;
      cache.current[key] = events;
      setCalendarCache((previous) => ({ ...previous, [key]: events }));
      setErrorKey((current) => current === key ? null : current);
    } catch {
      if (gen.current[key] === generation) setErrorKey(key);
    } finally {
      if (gen.current[key] === generation) {
        setLoadingKey((current) => current === key ? null : current);
      }
    }
  }, []);

  useEffect(() => {
    visibleMonthRef.current = visibleMonth;
    void loadMonth(visibleMonth);
  }, [loadMonth, visibleMonth]);

  useFocusEffect(useCallback(() => {
    setToday(new Date());
    void loadMonth(visibleMonthRef.current, true);
  }, [loadMonth]));

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const selectedKey = dayKey(selectedDate);
  const currentMonthKey = monthKey(visibleMonth);
  const monthEvents = calendarCache[currentMonthKey] ?? cache.current[currentMonthKey] ?? [];
  const groupedEvents = groupByDay(monthEvents);
  const selectedEvents = groupedEvents[selectedKey] ?? [];
  const cells = mode === 'month' ? monthMatrix(visibleMonth.getFullYear(), visibleMonth.getMonth()).flat() : weekDates(selectedDate);
  const currentLoading = loadingKey === currentMonthKey && !cache.current[currentMonthKey];
  const currentError = errorKey === currentMonthKey && !cache.current[currentMonthKey];
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const selectMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(next);
  };
  const moveWeek = (offset: number) => {
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + offset * 7);
    setSelectedDate(next);
    setVisibleMonth(firstOfMonth(next));
  };
  const jumpToday = () => {
    const now = new Date();
    setToday(now);
    setSelectedDate(now);
    setVisibleMonth(firstOfMonth(now));
  };

  return (
    <Screen>
      <Body
        ref={bodyRef}
        pad={20}
        contentStyle={styles.content}
        onRefresh={() => loadMonth(visibleMonth, true)}
      >
        <AdminLargeHeader
          title="Calendar"
          subtitle={monthLabel}
          trailing={
            <View style={[styles.modeSwitch, { backgroundColor: t.surface2 }]}>
              {(['month', 'week'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setMode(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === option }}
                  accessibilityLabel={`${option[0]!.toUpperCase()}${option.slice(1)} view`}
                  style={[styles.modeButton, mode === option && { backgroundColor: t.text }]}
                >
                  <Text style={[styles.modeText, { color: mode === option ? t.bg : t.text2 }]}>
                    {option[0]!.toUpperCase() + option.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          }
        />

        <View style={styles.monthNav}>
          <Pressable
            onPress={() => mode === 'month' ? selectMonth(-1) : moveWeek(-1)}
            accessibilityRole="button"
            accessibilityLabel={mode === 'month' ? 'Previous month' : 'Previous week'}
            style={({ pressed }) => [styles.navButton, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
          >
            <Ic name="back" size={18} color={t.text2} />
          </Pressable>
          <Pressable onPress={jumpToday} accessibilityRole="button" accessibilityLabel="Jump to today">
            <Text style={[styles.monthTitle, { color: t.text }]}>{mode === 'month' ? monthLabel : selectedLabel}</Text>
          </Pressable>
          <Pressable onPress={jumpToday} accessibilityRole="button" accessibilityLabel="Go to today" style={[styles.todayButton, { backgroundColor: t.surface2 }]}>
            <Text style={[styles.todayText, { color: t.text2 }]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => mode === 'month' ? selectMonth(1) : moveWeek(1)}
            accessibilityRole="button"
            accessibilityLabel={mode === 'month' ? 'Next month' : 'Next week'}
            style={({ pressed }) => [styles.navButton, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
          >
            <Ic name="chevR" size={18} color={t.text2} />
          </Pressable>
        </View>

        <View style={styles.calendar}>
          <View style={styles.daysRow}>
            {WEEKDAYS.map((day, index) => (
              <Text key={`${day}-${index}`} style={[styles.weekday, { color: t.text3 }]}>{day}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((date) => {
              const key = dayKey(date);
              const selected = key === selectedKey;
              const isToday = key === dayKey(today);
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const events = groupedEvents[key] ?? [];
              const dots = events.filter((event) => event.kind === 'interview' || !eventMuted(event) || event.disputeStatus === 'flagged').slice(0, 3);
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    setSelectedDate(date);
                    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
                      setVisibleMonth(firstOfMonth(date));
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${events.length ? `, ${events.length} events` : ''}`}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.dayCell, { opacity: pressed ? 0.72 : inMonth ? 1 : 0.45 }]}
                >
                  <View style={[styles.dayNumber, selected && { backgroundColor: t.text }]}>
                    <Text style={[styles.dayText, { color: selected ? t.bg : isToday ? t.accent : t.text, fontWeight: selected || isToday ? '700' : '500' }]}>
                      {date.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dots}>
                    {dots.map((event) => (
                      <View key={`${event.kind}-${event.id}`} style={[styles.dot, { backgroundColor: eventColor(event, t) }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {currentError ? (
          <EmptyState
            icon="cal"
            title="Couldn't load calendar"
            subtitle="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void loadMonth(visibleMonth, true)}
          />
        ) : (
          <AdminSection label={currentLoading ? selectedLabel : `${selectedLabel} · ${selectedEvents.length} ${selectedEvents.length === 1 ? 'event' : 'events'}`}>
            {currentLoading ? (
              <View style={styles.skeletons}>
                <Skeleton height={64} />
                <Skeleton height={64} />
              </View>
            ) : selectedEvents.length ? selectedEvents.map((event) => (
              <CalendarEventRow
                key={`${event.kind}-${event.id}`}
                event={event}
                onPress={() => router.push(event.kind === 'interview' ? '/admin_tutors?tab=interviews' : '/admin_bookings?tab=all')}
              />
            )) : <AdminRow title="No sessions or interviews" muted />}
          </AdminSection>
        )}
      </Body>
      <TabBar role="admin" active={active} onTab={onTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 17, paddingBottom: 18 },
  modeSwitch: { flexDirection: 'row', padding: 3, borderRadius: 12 },
  modeButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  modeText: { fontSize: 11.5, fontWeight: '600' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 14, fontWeight: '700' },
  todayButton: { marginLeft: 'auto', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  todayText: { fontSize: 11.5, fontWeight: '600' },
  calendar: { gap: 5 },
  daysRow: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10.5, fontWeight: '600', paddingBottom: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, minHeight: 47, alignItems: 'center', paddingTop: 2 },
  dayNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 12.5 },
  dots: { height: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3, marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  skeletons: { gap: 8, padding: 10 },
});

export default function AdminCalendar() {
  return (
    <AdminMfaGate>
      <AdminCalendarScreen />
    </AdminMfaGate>
  );
}
