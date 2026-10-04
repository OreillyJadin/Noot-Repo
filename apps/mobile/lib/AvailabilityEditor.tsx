// The hour-by-hour weekly availability picker: a day strip, quick presets, the hour chips
// for the selected day, and "copy to every weekday". Used by onboarding step 5 and Edit
// Availability so a tutor sets hours the same way in both (ERR-013). The screen owns the
// grid and the saving; this only edits it.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ic, useTheme } from '@noot/ui';
import { AV_DAYS, WEEKDAYS, HOURS, totalHours, type Day, type WeekGrid } from './weekGrid';

// Quick presets — a fast way to fill hours, not the only granularity on offer.
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

export function AvailabilityEditor({ value, onChange }: { value: WeekGrid; onChange: (next: WeekGrid) => void }) {
  const t = useTheme();
  const [day, setDay] = useState<Day>('Mon');

  const setDayHours = (d: Day, next: Set<number>) => onChange({ ...value, [d]: next });

  const toggleHour = (h: number) => {
    const next = new Set(value[day]);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    setDayHours(day, next);
  };

  // A preset adds its hours, or clears them if they're already all on — so tapping it twice
  // undoes it rather than being a one-way action.
  const applyPreset = (hours: number[]) => {
    const next = new Set(value[day]);
    const allOn = hours.every((h) => next.has(h));
    hours.forEach((h) => (allOn ? next.delete(h) : next.add(h)));
    setDayHours(day, next);
  };

  const clearDay = () => setDayHours(day, new Set());

  const copyToWeekdays = () => {
    const next = { ...value };
    WEEKDAYS.forEach((d) => { next[d] = new Set(value[day]); });
    onChange(next);
  };

  const total = totalHours(value);
  const dayCount = value[day].size;

  return (
    <>
      {/* day picker — each day shows how many hours it has open */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayScroll}
        keyboardShouldPersistTaps="handled"
      >
        {AV_DAYS.map((d) => {
          const on = d === day;
          const n = value[d].size;
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
          const sel = value[day].has(h);
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
          {dayCount} hour{dayCount === 1 ? '' : 's'} on {day} · {total} hour
          {total === 1 ? '' : 's'} open each week. You&apos;ll only ever get requests inside these hours.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
