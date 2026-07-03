// Badge — ported from app/kit.jsx (<Badge>).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

export type BadgeTone = 'neutral' | 'accent' | 'accentSoft' | 'good' | 'ink';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const t = useTheme();
  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: t.surface2, fg: t.text2 },
    accent: { bg: t.accent, fg: t.onAccent },
    accentSoft: { bg: t.accentWeak, fg: t.accent },
    good: { bg: t.goodWeak, fg: t.good },
    ink: { bg: t.text, fg: t.surface },
  };
  const c = tones[tone];
  return (
    <View style={[styles.base, { backgroundColor: c.bg }]}>
      <Text style={[styles.label, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});
