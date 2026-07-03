// Card — surface container, ported from app/kit.jsx (<Card>). Optionally selectable/pressable.
import React from 'react';
import { Pressable, View, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  style?: ViewStyle;
}

function parseRadius(px: string): number {
  const n = parseInt(px, 10);
  return Number.isFinite(n) ? Math.min(n, 999) : 16;
}

export function Card({ children, onPress, selected, style }: CardProps) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: parseRadius(t.cardRadius),
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? t.accent : t.border,
    padding: 16,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.base, base, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.base, base, style]}>{children}</View>;
}

const styles = StyleSheet.create({ base: { alignSelf: 'stretch' } });
