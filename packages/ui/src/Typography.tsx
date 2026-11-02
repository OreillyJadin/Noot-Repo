// Typography — ported from app/kit.jsx (H1/H2/Eyebrow/Sub/Muted/Label).
import React from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { TEXT_CAPS, useLargeText } from './textScale';

interface TypoProps {
  children: React.ReactNode;
  style?: TextStyle;
}

// A fixed lineHeight keeps scaling past the title's font-size cap, so large text drops it.
export function H1({ children, style }: TypoProps) {
  const t = useTheme();
  const large = useLargeText();
  return <Text maxFontSizeMultiplier={TEXT_CAPS.screenTitle} style={[styles.h1, { color: t.text }, style, large && styles.autoLine]}>{children}</Text>;
}
export function H2({ children, style }: TypoProps) {
  const t = useTheme();
  const large = useLargeText();
  return <Text maxFontSizeMultiplier={TEXT_CAPS.heading} style={[styles.h2, { color: t.text }, style, large && styles.autoLine]}>{children}</Text>;
}
export function Eyebrow({ children, style }: TypoProps) {
  const t = useTheme();
  return <Text style={[styles.eyebrow, { color: t.text2 }, style]}>{children}</Text>;
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
  autoLine: { lineHeight: undefined },
  h1: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  eyebrow: { fontSize: 13, fontWeight: '600' },
  sub: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
});
