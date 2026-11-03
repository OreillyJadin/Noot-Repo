import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GeckoMark } from './Gecko';

export function GeckoWatermark({ centered = false }: { centered?: boolean }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.layer, centered && styles.centered]}
    >
      <GeckoMark size={240} style={{ opacity: 0.06 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'center' },
  centered: { alignItems: 'center' },
});
