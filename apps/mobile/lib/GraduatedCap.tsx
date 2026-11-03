import React from 'react';
import { View } from 'react-native';
import { Ic, useTheme } from '@noot/ui';

export function GraduatedCap({ year, size = 16, color }: { year?: string | null; size?: number; color?: string }) {
  const t = useTheme();
  if (year !== 'Post Grad') return null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Graduated" style={{ flexShrink: 0 }}>
      <Ic name="cap" size={size} color={color ?? t.accent} strokeWidth={1.8} />
    </View>
  );
}
