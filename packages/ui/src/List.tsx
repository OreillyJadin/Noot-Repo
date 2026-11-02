import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Ic, type IconName } from './Icon';
import { TEXT_CAPS, useLargeText } from './textScale';
import { parseRadius } from './_util';

export interface LargeHeaderProps {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}

export function LargeHeader({ title, subtitle, trailing }: LargeHeaderProps) {
  const t = useTheme();
  const stacked = useLargeText();
  return (
    <View style={[styles.header, stacked && styles.headerStacked]}>
      <View style={[styles.headerText, stacked && styles.headerTextStacked]}>
        <Text maxFontSizeMultiplier={TEXT_CAPS.screenTitle} style={[styles.headerTitle, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: t.text3 }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export interface ListSectionProps {
  label: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}

export function ListSection({ label, action, children }: ListSectionProps) {
  const t = useTheme();
  const rows = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionLabel, { color: t.text3 }]}>{label}</Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => pressed && styles.pressedAction}
          >
            <Text style={[styles.sectionAction, { color: t.accent }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.sectionSurface, { backgroundColor: t.surface, borderRadius: parseRadius(t.cardRadius, 16) }]}>
        {rows.map((child, index) => (
          <React.Fragment key={index}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: t.border, marginLeft: dividerInset(child) }]} />
            ) : null}
            {child}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function dividerInset(child: React.ReactNode): number {
  if (!React.isValidElement<{ icon?: IconName; leading?: React.ReactNode; size?: 'compact' | 'regular' }>(child)) return 14;
  const { icon, leading, size } = child.props;
  if (size === 'regular') return icon || leading ? 52 : 16;
  return icon || leading ? 48 : 14;
}

// Above this font scale (iOS AX sizes, Android "largest") a trailing action beside the text
// squeezes the subtitle into mid-word breaks, so the row stacks: text on top, actions below.
export const STACK_FONT_SCALE = 1.5;

export interface ListRowProps {
  icon?: IconName;
  leading?: React.ReactNode;
  title: string;
  titleLines?: number;
  titleStyle?: TextStyle;
  subtitle?: string;
  subtitleLines?: number;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  count?: number;
  muted?: boolean;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
  size?: 'compact' | 'regular';
}

export function ListRow({
  icon,
  leading,
  title,
  titleLines = 1,
  titleStyle,
  subtitle,
  subtitleLines = 1,
  detail,
  trailing,
  count,
  muted = false,
  onPress,
  chevron = !!onPress,
  accessibilityLabel,
  size = 'compact',
}: ListRowProps) {
  const t = useTheme();
  const stacked = useWindowDimensions().fontScale >= STACK_FONT_SCALE;
  const pill = count && count > 0 ? <CountPill count={count} /> : null;
  const chev = chevron ? <Ic name="chevR" size={17} color={t.text3} strokeWidth={1.8} /> : null;
  // Stacked: multi-word titles wrap freely; a single word can't wrap, so it shrinks instead
  // of breaking mid-word ("Ambassad/ors").
  const oneWord = !/\s/.test(title.trim());
  const text = (
    <View style={styles.rowText}>
      <Text
        numberOfLines={stacked ? (oneWord ? 1 : undefined) : titleLines || undefined}
        adjustsFontSizeToFit={stacked && oneWord}
        minimumFontScale={0.6}
        style={[styles.rowTitle, size === 'regular' && styles.rowTitleRegular, { color: muted ? t.text2 : t.text }, titleStyle]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={(stacked ? 0 : subtitleLines) || undefined}
          style={[styles.rowSubtitle, size === 'regular' && styles.rowSubtitleRegular, { color: size === 'regular' ? t.text2 : t.text3 }]}
        >
          {subtitle}
        </Text>
      ) : null}
      {detail ? <View style={styles.rowDetail}>{detail}</View> : null}
    </View>
  );
  const lead = leading ?? (
    icon ? <Ic name={icon} size={size === 'regular' ? 21 : 20} color={muted ? t.text3 : t.text2} strokeWidth={1.7} /> : null
  );
  const content = stacked && (trailing || pill) ? (
    <View style={styles.rowStack}>
      <View style={styles.rowLine}>
        {lead}
        {text}
        {chev}
      </View>
      <View style={[styles.rowActions, { paddingLeft: lead ? 32 : 0 }]}>
        {pill}
        {trailing}
      </View>
    </View>
  ) : (
    <>
      {lead}
      {text}
      {pill}
      {trailing}
      {chev}
    </>
  );
  const rowStyle = size === 'regular' ? [styles.row, styles.rowRegular] : styles.row;
  const style = ({ pressed }: { pressed: boolean }) => size === 'regular'
    ? [styles.row, styles.rowRegular, { backgroundColor: pressed ? t.surface2 : 'transparent' }]
    : [styles.row, { backgroundColor: pressed ? t.surface2 : 'transparent' }];

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      style={style}
    >
      {content}
    </Pressable>
  );
}

export function StatusDot({ label, color }: { label: string; color: string }) {
  // The dot and its gap grow with the text, so large type doesn't read as "·Paid".
  const scale = Math.min(useWindowDimensions().fontScale, 2.5);
  return (
    <View style={[styles.status, { gap: Math.round(5 * scale) }]}>
      <View style={[styles.statusDot, { backgroundColor: color, width: 6 * scale, height: 6 * scale, borderRadius: 3 * scale }]} />
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function CountPill({ count }: { count: number }) {
  const t = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.countPill, { backgroundColor: t.accent }]}>
      <Text style={[styles.countText, { color: t.onAccent }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2, paddingTop: 7, paddingBottom: 3 },
  headerText: { flex: 1, minWidth: 0 },
  headerStacked: { flexDirection: 'column', alignItems: 'stretch' },
  headerTextStacked: { flex: 0 },
  headerTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, lineHeight: 35 },
  headerSubtitle: { fontSize: 13, marginTop: 3 },
  section: { gap: 8 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  sectionAction: { fontSize: 12, fontWeight: '600' },
  pressedAction: { opacity: 0.65 },
  sectionSurface: { overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth },
  row: { minHeight: 54, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowRegular: { minHeight: 50, paddingHorizontal: 16 },
  rowText: { flex: 1, minWidth: 0 },
  rowStack: { flex: 1, minWidth: 0, gap: 8 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowTitleRegular: { fontSize: 16, fontWeight: '400' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  rowSubtitleRegular: { fontSize: 13 },
  rowDetail: { marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11.5, fontWeight: '600' },
  countPill: { minWidth: 22, minHeight: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontWeight: '700' },
});
