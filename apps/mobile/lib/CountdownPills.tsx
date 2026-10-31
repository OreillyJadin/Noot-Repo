import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@noot/ui';
import { countdownParts } from './countdown';

function useCountdownClock(externalNow?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (externalNow != null) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [externalNow]);
  return externalNow ?? now;
}

export function CountdownPills({ target, endsAt, now: externalNow }: { target: number; endsAt?: number; now?: number }) {
  const t = useTheme();
  const now = useCountdownClock(externalNow);
  const { d, h, m, started } = countdownParts(target, now);
  if (started) {
    return (
      <View style={styles.pillsRow}>
        <View style={styles.pill}>
          <Text style={[styles.pillValue, { color: t.onAccent }]}>
            {endsAt == null ? 'Starting now' : now < endsAt ? `${Math.ceil((endsAt - now) / 60_000)} min remaining` : 'Scheduled time ended'}
          </Text>
        </View>
      </View>
    );
  }
  const parts: [number, string][] = [
    [d, 'days'],
    [h, 'hrs'],
    [m, 'min'],
  ];
  return (
    <View style={styles.pillsRow}>
      {parts.map(([v, l]) => (
        <View key={l} style={styles.pill}>
          <Text style={[styles.pillValue, { color: t.onAccent }]}>{String(v).padStart(2, '0')}</Text>
          <Text style={[styles.pillLabel, { color: t.onAccent }]}>{l.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pillsRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' },
  pillValue: { fontWeight: '800', fontSize: 22, lineHeight: 24 },
  pillLabel: { fontSize: 10, opacity: 0.85, marginTop: 3, letterSpacing: 0.6 },
});
