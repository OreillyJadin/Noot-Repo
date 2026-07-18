// Brand marks — ported from app/kit.jsx (Wordmark, HeroIcon). Wordmark pairs the gecko
// brand image (GeckoMark) with the lowercase "noot" lockup; HeroIcon uses an accent
// circle + icon.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Ic, type IconName } from './Icon';
import { GeckoMark } from './Gecko';

export interface WordmarkProps {
  size?: number;
  tone?: 'ink' | 'sage' | 'cream';
}

export function Wordmark({ size = 22, tone = 'ink' }: WordmarkProps) {
  const t = useTheme();
  const color = tone === 'cream' ? '#F4F2EC' : tone === 'sage' ? t.accent : t.text;
  return (
    <View style={styles.wordmark}>
      <GeckoMark size={size * 1.05} />
      <Text style={{ fontSize: size, fontWeight: '700', letterSpacing: -1, color }}>noot</Text>
    </View>
  );
}

export interface HeroIconProps {
  name: IconName;
  size?: number;
}

export function HeroIcon({ name, size = 72 }: HeroIconProps) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.hero,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.accent },
      ]}
    >
      <Ic name={name} size={size * 0.42} color={t.onAccent} strokeWidth={2.4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
});
