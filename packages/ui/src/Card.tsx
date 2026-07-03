// Card — surface container, ported from app/kit.jsx (<Card>). Optional flat/selected/pressable.
import React from 'react';
import { Pressable, View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useTheme } from './ThemeProvider';
import { parseRadius } from './_util';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, selected, flat, style }: CardProps) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: parseRadius(t.cardRadius, 16),
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? t.accent : t.border,
    padding: 16,
    ...(flat
      ? {}
      : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 }),
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
