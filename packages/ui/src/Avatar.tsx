// Avatar — ported from app/kit.jsx (<Avatar>). Shows a photo when `uri` is given,
// else initials (`label`) or a fallback user glyph.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Ic } from './Icon';

export interface AvatarProps {
  size?: number;
  label?: string;
  accent?: boolean;
  /** Public photo URL. When set, the image replaces the initials/glyph. */
  uri?: string | null;
}

export function Avatar({ size = 44, label, accent, uri }: AvatarProps) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: accent ? t.accent : t.surface2,
          borderColor: t.border,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" accessibilityLabel="Profile photo" />
      ) : label ? (
        <Text style={{ color: accent ? t.onAccent : t.text3, fontWeight: '700', fontSize: size * 0.36 }}>{label}</Text>
      ) : (
        <Ic name="user" size={size * 0.55} color={accent ? t.onAccent : t.text3} strokeWidth={1.6} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
});
