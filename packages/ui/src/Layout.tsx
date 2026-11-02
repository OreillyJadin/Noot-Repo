// Layout primitives — ported from app/kit.jsx (Screen/NavTop/Body/ActionBar).
// The prototype used fixed TOP_INSET/BOT_INSET; here we use real safe-area insets.
import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StatusBar, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
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
  const { fontScale } = useWindowDimensions();
  const large = useLargeText();
  const side = large ? styles.navSideLarge : null;
  // Wraps at word boundaries once text is enlarged instead of truncating ("Ambassad…").
  const titleLines = large ? 3 : fontScale > 1 ? 2 : 1;
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
          numberOfLines={titleLines}
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

export interface BandHeaderProps {
  title: string;
  /** Small line above the title, e.g. the date. */
  subtitle?: string;
  /** Right side of the title row (bell, avatar…). */
  trailing?: React.ReactNode;
  /** Content inside the band under the title (search field, identity block). */
  children?: React.ReactNode;
  /** Extra band height at the bottom so the first body element can overlap it with a negative marginTop. */
  overlap?: number;
}

export function BandHeader({ title, subtitle, trailing, children, overlap }: BandHeaderProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  return (
    <View style={[styles.bandHeader, { backgroundColor: t.band, paddingTop: insets.top + 8, paddingBottom: 18 + (overlap ?? 0) }]}>
      <View pointerEvents="none" style={[styles.bandOverscroll, { backgroundColor: t.band }]} />
      <StatusBar barStyle="light-content" />
      <View style={[styles.bandTitleRow, large && styles.bandTitleRowLarge]}>
        <View style={styles.bandTitleText}>
          {subtitle ? <Text style={[styles.bandSubtitle, { color: t.onBand }]}>{subtitle}</Text> : null}
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_CAPS.screenTitle}
            style={[styles.bandTitle, { color: t.onBand }, large && styles.bandTitleAutoLine]}
          >
            {title}
          </Text>
        </View>
        {trailing}
      </View>
      {children ? <View style={styles.bandChildren}>{children}</View> : null}
    </View>
  );
}

export interface BodyProps {
  children: React.ReactNode;
  pad?: number;
  contentStyle?: ViewStyle;
  /** Full-bleed element at the top of the scroll content (e.g. <BandHeader/>), outside the padding. */
  header?: React.ReactNode;
  /** RefreshControl spinner colour; defaults to t.accent. Pass t.onBand when `header` is a BandHeader. */
  refreshTint?: string;
  /** Enables pull-to-refresh. The spinner shows until the returned promise settles. */
  onRefresh?: () => Promise<unknown> | void;
}

// forwardRef exposes the inner ScrollView so callers (e.g. the tab bar's
// "reselect" action) can scroll the page back to top. See lib/useTabNav.
// KeyboardAwareScrollView keeps the focused field, and the caret of a growing multiline
// field, above the keyboard on iOS and Android.
export const Body = React.forwardRef<ScrollView, BodyProps>(function Body(
  { children, pad = 20, contentStyle, header, refreshTint, onRefresh },
  ref,
) {
  const t = useTheme();
  const tint = refreshTint ?? t.accent;
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
          <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={tint} colors={[tint]} />
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
      {header ? <View style={{ marginHorizontal: -pad, marginTop: -4 }}>{header}</View> : null}
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
  if (!large) return <View style={[styles.adaptiveRow, style]}>{children}</View>;
  // Each child gets its own row so a child's `flex: 1` keeps stretching it across the width
  // instead of acting vertically (where it would drop the child's natural height).
  return (
    <View style={[styles.adaptiveRow, style, styles.adaptiveStacked]}>
      {React.Children.toArray(children).map((child, i) => (
        <View key={React.isValidElement(child) && child.key != null ? child.key : i} style={styles.adaptiveCell}>
          {child}
        </View>
      ))}
    </View>
  );
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
  adaptiveCell: { flexDirection: 'row' },
  bandHeader: { position: 'relative', paddingHorizontal: 20 },
  bandOverscroll: { position: 'absolute', left: 0, right: 0, top: -1000, height: 1000 },
  bandTitleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  bandTitleRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  bandTitleText: { flex: 1, minWidth: 0 },
  bandTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.6 },
  bandTitleAutoLine: { lineHeight: undefined },
  bandSubtitle: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  bandChildren: { marginTop: 12 },
  actionBar: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
});
