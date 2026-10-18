// Layout primitives — ported from app/kit.jsx (Screen/NavTop/Body/ActionBar).
// The prototype used fixed TOP_INSET/BOT_INSET; here we use real safe-area insets.
import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import { Ic } from './Icon';
import { TEXT_CAPS, useLargeText } from './textScale';

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
  const large = useLargeText();
  const side = large ? styles.navSideLarge : null;
  return (
    <View style={[styles.navWrap, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
      <View style={styles.navRow}>
        <View style={[styles.navSide, side]}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8}>
              <Ic name="back" size={24} color={t.accent} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
        <Text
          numberOfLines={large ? 3 : 1}
          maxFontSizeMultiplier={TEXT_CAPS.screenTitle}
          style={[styles.navTitle, { color: t.text }]}
        >
          {title}
        </Text>
        <View style={[styles.navSide, side, { alignItems: 'flex-end' }]}>{trailing}</View>
      </View>
    </View>
  );
}

export interface BodyProps {
  children: React.ReactNode;
  pad?: number;
  contentStyle?: ViewStyle;
  /** Enables pull-to-refresh. The spinner shows until the returned promise settles. */
  onRefresh?: () => Promise<unknown> | void;
}

// forwardRef exposes the inner ScrollView so callers (e.g. the tab bar's
// "reselect" action) can scroll the page back to top. See lib/useTabNav.
// KeyboardAwareScrollView keeps the focused field, and the caret of a growing multiline
// field, above the keyboard on iOS and Android.
export const Body = React.forwardRef<ScrollView, BodyProps>(function Body(
  { children, pad = 20, contentStyle, onRefresh },
  ref,
) {
  const t = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);
  const pull = React.useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  return (
    <KeyboardAwareScrollView
      ref={ref as React.Ref<KeyboardAwareScrollViewRef>}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={t.accent} colors={[t.accent]} />
        ) : undefined
      }
      style={styles.bodyScroll}
      contentContainerStyle={[{ padding: pad, paddingTop: 4, gap: 14 }, contentStyle]}
      // persistTaps: a control under the keyboard responds on the FIRST tap instead of the
      // tap being swallowed to dismiss. dismissMode: scrolling the page puts the keyboard
      // away, so a search list can be browsed without reaching for "done".
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={24}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

export interface AdaptiveRowProps {
  children: React.ReactNode;
  /** The row's own style (gap, margins…). Its flexDirection is overridden when stacked. */
  style?: ViewStyle | ViewStyle[];
}

/**
 * A row that stacks into a column at large text sizes (see useLargeText), for side-by-side
 * items that can't share the width once their text grows: button pairs, stat cards, a name
 * next to a price. Default-size layout is exactly the row it replaces.
 */
export function AdaptiveRow({ children, style }: AdaptiveRowProps) {
  const large = useLargeText();
  return <View style={[styles.adaptiveRow, style, large && styles.adaptiveStacked]}>{children}</View>;
}

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
  navSideLarge: { width: undefined, minWidth: 44, flexShrink: 0 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  bodyScroll: { flex: 1 },
  adaptiveRow: { flexDirection: 'row' },
  adaptiveStacked: { flexDirection: 'column', alignItems: 'stretch' },
  actionBar: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
});
