// Typography — ported from app/kit.jsx (H1/H2/Eyebrow/Sub/Muted/Label).
import React from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

interface TypoProps {
  children: React.ReactNode;
  style?: TextStyle;
}

export function H1({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[styles.h1, { color: t.text }, style]}>{children}</Text>;
}
export function H2({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[styles.h2, { color: t.text }, style]}>{children}</Text>;
}
export function Eyebrow({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[styles.eyebrow, { color: t.accent }, style]}>{children}</Text>;
}
export function Sub({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[styles.sub, { color: t.text2 }, style]}>{children}</Text>;
}
export function Muted({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[{ color: t.text3 }, style]}>{children}</Text>;
}
export function Label({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.text2 }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, lineHeight: 31, fontWeight: '700', letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  sub: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
});
