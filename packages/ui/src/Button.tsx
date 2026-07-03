// Btn — the primary CTA primitive, ported from app/kit.jsx (<Btn>). Reads tokens
// from ThemeProvider. Radii come as CSS px strings in the tokens; parseRadius()
// converts to the numeric RN needs.
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}

function parseRadius(px: string): number {
  const n = parseInt(px, 10);
  return Number.isFinite(n) ? Math.min(n, 999) : 12;
}

export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'secondary' ? t.surface2 : 'transparent';
  const fg = variant === 'primary' ? t.onAccent : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && variant === 'primary' ? t.accentPress : bg,
          borderRadius: parseRadius(t.btnRadius),
          borderColor: variant === 'ghost' ? t.border : 'transparent',
          borderWidth: variant === 'ghost' ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16 },
});
