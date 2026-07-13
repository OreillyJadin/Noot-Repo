import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

const GECKO = require('../assets/gecko-sage.png');

/** The Noot gecko mark. Replaces the 🦎 emoji used across headers and cards. */
export function GeckoLogo({ size = 40, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={GECKO} style={[{ width: size, height: size, resizeMode: 'contain' }, style]} />;
}
