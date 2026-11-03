import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

export function TabPressScale({ pressed, children, style }: { pressed: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const animation = Animated.timing(scale, { toValue: pressed ? 0.92 : 1, duration: 100, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [pressed, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
