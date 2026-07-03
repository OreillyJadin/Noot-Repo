// Btn — ported from app/kit.jsx (<Btn>). kinds + sizes + optional trailing icon.
import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { parseRadius } from './_util';
import { Ic, type IconName } from './Icon';

export type ButtonKind = 'primary' | 'secondary' | 'tint' | 'ghost' | 'dark';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  size?: ButtonSize;
  full?: boolean;
  disabled?: boolean;
  iconRight?: IconName;
  style?: ViewStyle;
}

const HEIGHT: Record<ButtonSize, number> = { lg: 52, md: 44, sm: 36 };
const FONT: Record<ButtonSize, number> = { lg: 17, md: 15, sm: 13 };

export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'lg',
  full,
  disabled,
  iconRight,
  style,
}: ButtonProps) {
  const t = useTheme();
  const palette: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.accent, fg: t.onAccent },
    secondary: { bg: t.surface, fg: t.text, border: t.borderStrong },
    tint: { bg: t.accentWeak, fg: t.accent },
    ghost: { bg: 'transparent', fg: t.accent },
    dark: { bg: t.text, fg: t.surface },
  };
  const c = palette[kind];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          borderRadius: parseRadius(t.btnRadius),
          backgroundColor: pressed && kind === 'primary' ? t.accentPress : c.bg,
          borderColor: c.border ?? 'transparent',
          borderWidth: c.border ? 1 : 0,
          width: full ? '100%' : undefined,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.label, { color: c.fg, fontSize: FONT[size] }]}>{label}</Text>
        {iconRight ? <Ic name={iconRight} size={FONT[size] + 2} color={c.fg} strokeWidth={2.2} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '600' },
});
