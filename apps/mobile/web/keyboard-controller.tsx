// Web stand-in for react-native-keyboard-controller, aliased in metro.config.js for web only.
// The library is a native module; a browser moves content above its own on-screen keyboard,
// so these are the plain react-native views with the keyboard-only props dropped.
import React from 'react';
import { ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native';

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type AwareProps = ScrollViewProps & { bottomOffset?: number; extraKeyboardSpace?: number };
export function KeyboardAwareScrollView({ bottomOffset: _b, extraKeyboardSpace: _e, ...props }: AwareProps) {
  return <ScrollView {...props} />;
}

type AvoidingProps = ViewProps & {
  behavior?: 'height' | 'position' | 'padding' | 'translate-with-padding';
  keyboardVerticalOffset?: number;
  contentContainerStyle?: ViewProps['style'];
  enabled?: boolean;
};
export function KeyboardAvoidingView({
  behavior: _b,
  keyboardVerticalOffset: _k,
  contentContainerStyle: _c,
  enabled: _e,
  ...props
}: AvoidingProps) {
  return <View {...props} />;
}
