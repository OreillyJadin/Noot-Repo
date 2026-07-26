// P5 Set Availability (Edit) — the tutor's recurring weekly template. Distinct from the
// Calendar tab (day-by-day agenda + one-off slot toggles), linked from the intro copy.
// Wired to @noot/core: the hour grid is folded into weekly windows and persisted via
// profile.updateAvailability(...).
//
// GRANULARITY: this used to offer three coarse blocks (Morning 8a–12p, Afternoon 12–5p,
// Evening 5–10p), so the smallest thing a tutor could offer was a four-hour stretch. Nothing
// downstream required that — the DB stores arbitrary start/end windows and the student-side
// picker already generates hourly starts (lib/availability.ts) — so the blocks were purely a
// limitation of this screen. It's now hour-by-hour: a tutor can open 3–4pm alone.
//
// Contiguous selected hours are merged into a single window on save (09,10,11 → 09:00–12:00)
// so the stored shape stays the same handful of rows it always was, and existing saved
// windows load back correctly whatever granularity they were written at.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useMe } from '../lib/useMe';

type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

const AV_DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// dayOfWeek per the API contract: 0 = Sunday … 6 = Saturday.
const DAY_OF_WEEK: Record<Day, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Selectable hours, as the hour a session would START. 8 = 8–9am … 21 = 9–10pm.
const FIRST_HOUR = 8;
const LAST_HOUR = 21;
const HOURS: number[] = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

// Quick presets, kept as a convenience — the same ranges the old block grid offered, now
// just a fast way to fill hours rather than the only granularity on offer.
const PRESETS: { label: string; hours: number[] }[] = [
  { label: 'Morning', hours: [8, 9, 10, 11] },
  { label: 'Afternoon', hours: [12, 13, 14, 15, 16] },
  { label: 'Evening', hours: [17, 18, 19, 20, 21] },
];

/** 14 → "2 PM", 8 → "8 AM". */
function hourLabel(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

/** 9 → "09:00" */
function hhmm(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** "HH:MM" → minutes since midnight (tolerates a trailing ":SS"). */
function hm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function emptyAv(): Record<Day, Set<number>> {
  const m = {} as Record<Day, Set<number>>;
  AV_DAYS.forEach((d) => { m[d] = new Set<number>(); });
  return m;
}

/**
 * Saved windows → the hour grid. An hour is on when a window covers it, so a window written
 * at any granularity (including the old 4-hour blocks) round-trips into the right hours.
 */
function gridFromWindows(windows: { dayOfWeek: number; startTime: string; endTime: string }[]) {
  const grid = emptyAv();
  for (const day of AV_DAYS) {
    for (const h of HOURS) {
      const start = h * 60;
      const covered = windows.some(
        (w) => w.dayOfWeek === DAY_OF_WEEK[day] && hm(w.startTime) <= start && hm(w.endTime) >= start + 60,
      );
      if (covered) grid[day].add(h);
    }
  }
  return grid;
}

/** Hour grid → weekly windows, merging runs of consecutive hours into one window. */
function windowsFromGrid(grid: Record<Day, Set<number>>) {
  const out: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
  for (const day of AV_DAYS) {
    const hours = [...grid[day]].sort((a, b) => a - b);
    let runStart: number | null = null;
    let prev: number | null = null;
    const flush = () => {
      if (runStart != null && prev != null) {
        out.push({ dayOfWeek: DAY_OF_WEEK[day], startTime: hhmm(runStart), endTime: hhmm(prev + 1) });
      }
      runStart = null;
      prev = null;
    };
    for (const h of hours) {
      if (runStart == null) { runStart = h; prev = h; continue; }
      if (h === (prev as number) + 1) { prev = h; continue; }
      flush();
      runStart = h;
      prev = h;
    }
    flush();
  }
  return out;
}

export default function EditAvailability() {
  const t = useTheme();
  const router = useRouter();
  const { me } = useMe();
  const [av, setAv] = useState<Record<Day, Set<number>>>(emptyAv);
  const [day, setDay] = useState<Day>('Mon');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    let active = true;
    api.tutors
      .getAvailability(me.id)
      .then((windows) => { if (active) setAv(gridFromWindows(windows)); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [me]);

  const setDayHours = (d: Day, next: Set<number>) =>
    setAv((prev) => ({ ...prev, [d]: next }) as Record<Day, Set<number>>);

  const toggleHour = (h: number) => {
    const next = new Set(av[day]);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    setDayHours(day, next);
  };

  // A preset adds its hours, or clears them if they're already all on — so tapping it twice
  // undoes it rather than being a one-way action.
  const applyPreset = (hours: number[]) => {
    const next = new Set(av[day]);
    const allOn = hours.every((h) => next.has(h));
    hours.forEach((h) => (allOn ? next.delete(h) : next.add(h)));
    setDayHours(day, next);
  };

  const clearDay = () => setDayHours(day, new Set());

  const copyToWeekdays = () => {
    const source = new Set(av[day]);
    setAv((prev) => {
      const next = { ...prev } as Record<Day, Set<number>>;
      WEEKDAYS.forEach((d) => { next[d] = new Set(source); });
      return next;
    });
  };

  const totalHours = useMemo(() => AV_DAYS.reduce((n, d) => n + av[d].size, 0), [av]);
  const dayCount = av[day].size;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.profile.updateAvailability(windowsFromGrid(av));
      Alert.alert('Availability saved');
      router.back();
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Set availability" onBack={() => router.back()} />
      <Body>
        <Text style={[styles.intro, { color: t.text2 }]}>
          This is your <Text style={{ color: t.text, fontWeight: '700' }}>typical week</Text>, hour by hour — students
          can request any hour you turn on. Need to block one specific day or open an extra slot? Use the{' '}
          <Text onPress={() => router.push('/tutor_calendar')} style={{ color: t.accent, fontWeight: '600' }}>
            Calendar
          </Text>
          .
        </Text>

        {/* day picker — each day shows how many hours it has open */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayScroll}
          keyboardShouldPersistTaps="handled"
        >
          {AV_DAYS.map((d) => {
            const on = d === day;
            const n = av[d].size;
            return (
              <Pressable
                key={d}
                onPress={() => setDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${d}, ${n} hour${n === 1 ? '' : 's'} open`}
                style={[
                  styles.dayChip,
                  { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.border },
                ]}
              >
                <Text style={[styles.dayChipLabel, { color: on ? t.onAccent : t.text }]}>{d}</Text>
                <Text style={[styles.dayChipCount, { color: on ? t.onAccent : n ? t.accent : t.text3 }]}>
                  {n ? `${n}h` : '—'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.presetRow}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => applyPreset(p.hours)}
              style={[styles.preset, { borderColor: t.borderStrong }]}
            >
              <Text style={[styles.presetLabel, { color: t.text2 }]}>{p.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={clearDay} style={[styles.preset, { borderColor: t.borderStrong }]}>
            <Text style={[styles.presetLabel, { color: t.text2 }]}>Clear</Text>
          </Pressable>
        </View>

        <View style={styles.hourWrap}>
          {HOURS.map((h) => {
            const sel = av[day].has(h);
            return (
              <Pressable
                key={h}
                onPress={() => toggleHour(h)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${hourLabel(h)} to ${hourLabel(h + 1)} on ${day}`}
                style={[
                  styles.hour,
                  { backgroundColor: sel ? t.accent : t.surface, borderColor: sel ? t.accent : t.border },
                ]}
              >
                <Text style={[styles.hourLabel, { color: sel ? t.onAccent : t.text2 }]}>{hourLabel(h)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={copyToWeekdays} style={[styles.copyBtn, { borderColor: t.accentBorder }]}>
          <Ic name="repeat" size={15} color={t.accent} strokeWidth={1.9} />
          <Text style={[styles.copyLabel, { color: t.accent }]}>Copy {day} to every weekday</Text>
        </Pressable>

        <View style={styles.footNote}>
          <View style={{ marginTop: 1 }}>
            <Ic name="clock" size={14} color={t.accent} strokeWidth={1.8} />
          </View>
          <Text style={[styles.footNoteText, { color: t.text3 }]}>
            {dayCount} hour{dayCount === 1 ? '' : 's'} on {day} · {totalHours} hour
            {totalHours === 1 ? '' : 's'} open each week. You&apos;ll only ever get requests inside these hours.
          </Text>
        </View>
      </Body>
      <ActionBar>
        <Button label={loading ? 'Loading…' : 'Save changes'} full onPress={save} disabled={saving || loading} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 4 },
  dayScroll: { gap: 6, paddingVertical: 2, paddingRight: 4 },
  dayChip: { minWidth: 52, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5 },
  dayChipLabel: { fontSize: 13, fontWeight: '700' },
  dayChipCount: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  presetRow: { flexDirection: 'row', gap: 6 },
  preset: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  presetLabel: { fontSize: 12, fontWeight: '600' },
  hourWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hour: { width: '23.2%', paddingVertical: 10, borderRadius: 11, alignItems: 'center', borderWidth: 1.5 },
  hourLabel: { fontSize: 12.5, fontWeight: '600' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  copyLabel: { fontSize: 13, fontWeight: '600' },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 2, paddingHorizontal: 2 },
  footNoteText: { flex: 1, fontSize: 12, lineHeight: 17.4 },
});
