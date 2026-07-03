// Divider, ProgressDots, Stepper — ported from app/kit.jsx.
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Ic } from './Icon';

export function Divider({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.border }, style]} />;
}

export interface ProgressDotsProps {
  total: number;
  current: number;
  style?: ViewStyle;
}

export function ProgressDots({ total, current, style }: ProgressDotsProps) {
  const t = useTheme();
  return (
    <View style={[styles.dots, style]}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, { backgroundColor: i < current ? t.accent : t.surface2 }]}
        />
      ))}
    </View>
  );
}

export interface StepperProps {
  n: number;
  active?: boolean;
  done?: boolean;
}

export function Stepper({ n, active, done }: StepperProps) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.step,
        {
          backgroundColor: done ? t.accent : active ? t.accentWeak : 'transparent',
          borderColor: done || active ? 'transparent' : t.borderStrong,
        },
      ]}
    >
      {done ? (
        <Ic name="check" size={15} color={t.onAccent} strokeWidth={2.6} />
      ) : (
        <Text style={{ color: active ? t.accent : t.text3, fontWeight: '700', fontSize: 13 }}>{n}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  step: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
