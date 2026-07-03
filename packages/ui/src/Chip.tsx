// Chip — ported from app/kit.jsx (<Chip>). on = selected (ink), tint = accent-weak.
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { parseRadius } from './_util';

export interface ChipProps {
  label: string;
  on?: boolean;
  tint?: boolean;
  onPress?: () => void;
}

export function Chip({ label, on, tint, onPress }: ChipProps) {
  const t = useTheme();
  const style = on
    ? { bg: t.text, fg: t.surface, border: t.text }
    : tint
      ? { bg: t.accentWeak, fg: t.accent, border: 'transparent' }
      : { bg: t.surface, fg: t.text2, border: t.borderStrong };
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: style.bg, borderColor: style.border, borderRadius: parseRadius(t.chipRadius, 999) },
      ]}
    >
      <Text style={[styles.label, { color: style.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 34, paddingHorizontal: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
});
