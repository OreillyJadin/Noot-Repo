// Skeleton — a neutral placeholder block shown while data loads, so screens don't
// flash fallback strings ("there", "Student", "- -") before the real value arrives.
// Static (no animation) by design: cheap, and identical on native + web.
import React from 'react';
import { View, type ViewStyle, type DimensionValue } from 'react-native';
import { useTheme } from './ThemeProvider';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: t.border, opacity: 0.6 }, style]}
    />
  );
}
