// The Noot gecko mark — the single source of truth for the brand graphic across the
// whole app (headers, cards, the Home tab, the wordmark). Swapping in a new approved
// asset is a one-file change: replace packages/ui/assets/gecko-sage.png.
import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

const GECKO = require('../assets/gecko-sage.png');

export interface GeckoMarkProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function GeckoMark({ size = 40, style }: GeckoMarkProps) {
  return <Image source={GECKO} style={[{ width: size, height: size, resizeMode: 'contain' }, style]} />;
}
