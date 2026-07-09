// Layout primitives — ported from app/kit.jsx (Screen/NavTop/Body/ActionBar).
// The prototype used fixed TOP_INSET/BOT_INSET; here we use real safe-area insets.
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import { Ic } from './Icon';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.screen, { backgroundColor: t.bg }, style]}>{children}</View>;
}

export interface NavTopProps {
  title?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
}

export function NavTop({ title, onBack, trailing }: NavTopProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.navWrap, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
      <View style={styles.navRow}>
        <View style={styles.navSide}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8}>
              <Ic name="back" size={24} color={t.accent} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
        <Text numberOfLines={1} style={[styles.navTitle, { color: t.text }]}>
          {title}
        </Text>
        <View style={[styles.navSide, { alignItems: 'flex-end' }]}>{trailing}</View>
      </View>
    </View>
  );
}

export interface BodyProps {
  children: React.ReactNode;
  pad?: number;
  contentStyle?: ViewStyle;
}

// forwardRef exposes the inner ScrollView so callers (e.g. the tab bar's
// "reselect" action) can scroll the page back to top. See lib/useTabNav.
export const Body = React.forwardRef<ScrollView, BodyProps>(function Body(
  { children, pad = 20, contentStyle },
  ref,
) {
  return (
    <ScrollView
      ref={ref}
      style={styles.bodyScroll}
      contentContainerStyle={[{ padding: pad, paddingTop: 4, gap: 14 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
});

export function ActionBar({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.actionBar,
        { paddingBottom: insets.bottom + 12, backgroundColor: t.bg, borderTopColor: t.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navWrap: { zIndex: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 8, gap: 4 },
  navSide: { width: 64, justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  bodyScroll: { flex: 1 },
  actionBar: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
});
