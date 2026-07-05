// P5 Set Availability (Edit) — ported from screens-edit.jsx (EditAvailability).
// A recurring weekly template — the tutor's "typical week". Distinct from the
// Calendar tab (day-by-day agenda + one-off slot toggles), linked from the intro
// copy. Wired to @noot/core: the block grid is flattened into weekly windows and
// persisted via profile.updateAvailability(...).
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';

type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
type BlockId = 'morning' | 'afternoon' | 'evening';

const AV_DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AV_BLOCKS: { id: BlockId; label: string; hrs: string }[] = [
  { id: 'morning', label: 'Morning', hrs: '8a–12p' },
  { id: 'afternoon', label: 'Afternoon', hrs: '12–5p' },
  { id: 'evening', label: 'Evening', hrs: '5–10p' },
];

// dayOfWeek per the API contract: 0 = Sunday … 6 = Saturday.
const DAY_OF_WEEK: Record<Day, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// Concrete clock windows for each block (24h "HH:MM").
const BLOCK_TIMES: Record<BlockId, { startTime: string; endTime: string }> = {
  morning: { startTime: '08:00', endTime: '12:00' },
  afternoon: { startTime: '12:00', endTime: '17:00' },
  evening: { startTime: '17:00', endTime: '22:00' },
};

function avInit(): Record<Day, Set<BlockId>> {
  const m = {} as Record<Day, Set<BlockId>>;
  AV_DAYS.forEach((d, i) => {
    m[d] = new Set<BlockId>(i < 5 ? ['afternoon', 'evening'] : i === 5 ? ['morning'] : []);
  });
  return m;
}

export default function EditAvailability() {
  const t = useTheme();
  const router = useRouter();
  const [av, setAv] = useState<Record<Day, Set<BlockId>>>(avInit);
  const [saving, setSaving] = useState(false);

  const toggle = (day: Day, block: BlockId) =>
    setAv((prev) => {
      const daySet = new Set(prev[day]);
      if (daySet.has(block)) daySet.delete(block);
      else daySet.add(block);
      return { ...prev, [day]: daySet } as Record<Day, Set<BlockId>>;
    });

  const total = AV_DAYS.reduce((n, d) => n + av[d].size, 0);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const weekly = AV_DAYS.flatMap((day) =>
        AV_BLOCKS.filter((b) => av[day].has(b.id)).map((b) => ({
          dayOfWeek: DAY_OF_WEEK[day],
          startTime: BLOCK_TIMES[b.id].startTime,
          endTime: BLOCK_TIMES[b.id].endTime,
        })),
      );
      await api.profile.updateAvailability(weekly);
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
          This is your <Text style={{ color: t.text, fontWeight: '700' }}>typical week</Text> — students can request
          these times. Need to block one specific day or open an extra slot? Use the{' '}
          <Text onPress={() => router.push('/tutor_calendar')} style={{ color: t.accent, fontWeight: '600' }}>
            Calendar
          </Text>
          .
        </Text>

        <View style={{ gap: 8 }}>
          {AV_DAYS.map((day) => {
            const on = av[day].size > 0;
            return (
              <View key={day} style={styles.dayRow}>
                <Text style={[styles.dayLabel, { color: on ? t.text : t.text3 }]}>{day}</Text>
                <View style={styles.blockRow}>
                  {AV_BLOCKS.map((b) => {
                    const sel = av[day].has(b.id);
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => toggle(day, b.id)}
                        style={[
                          styles.block,
                          { backgroundColor: sel ? t.accent : t.surface, borderColor: sel ? t.accent : t.border },
                        ]}
                      >
                        <Text style={[styles.blockLabel, { color: sel ? t.onAccent : t.text2 }]}>{b.label}</Text>
                        <Text style={[styles.blockHrs, { color: sel ? 'rgba(255,255,255,0.7)' : t.text3 }]}>{b.hrs}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footNote}>
          <View style={{ marginTop: 1 }}>
            <Ic name="clock" size={14} color={t.accent} strokeWidth={1.8} />
          </View>
          <Text style={[styles.footNoteText, { color: t.text3 }]}>
            {total} time block{total === 1 ? '' : 's'} open each week. You&apos;ll only ever get requests inside these
            windows.
          </Text>
        </View>
      </Body>
      <ActionBar>
        <Button label="Save changes" full onPress={save} disabled={saving} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 16 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayLabel: { width: 42, fontSize: 14, fontWeight: '700' },
  blockRow: { flex: 1, flexDirection: 'row', gap: 6 },
  block: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 11, alignItems: 'center', borderWidth: 1.5 },
  blockLabel: { fontSize: 12.5, fontWeight: '600' },
  blockHrs: { fontSize: 10, marginTop: 1 },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, paddingHorizontal: 2 },
  footNoteText: { flex: 1, fontSize: 12, lineHeight: 17.4 },
});
