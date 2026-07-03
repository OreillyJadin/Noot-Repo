// Toggle — ported from app/kit.jsx (<Toggle>). iOS-style switch.
import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

export interface ToggleProps {
  on: boolean;
  onPress?: () => void;
}

export function Toggle({ on, onPress }: ToggleProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.track,
        { backgroundColor: on ? t.accent : t.surface2, borderColor: on ? t.accent : t.borderStrong },
      ]}
    >
      <View style={[styles.knob, { left: on ? 22 : 2 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 51, height: 31, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    top: 2,
    width: 27,
    height: 27,
    borderRadius: 999,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
