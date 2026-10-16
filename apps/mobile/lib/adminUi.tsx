import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { Ic, useTheme, type IconName } from '@noot/ui';

export function AdminLargeHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={[styles.headerTitle, { color: t.text, fontFamily: t.headingFont }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: t.text3 }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function AdminSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
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
      <View style={[styles.sectionSurface, { backgroundColor: t.surface, borderRadius: radius(t.cardRadius) }]}>
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
  if (!React.isValidElement<{ icon?: IconName; leading?: React.ReactNode }>(child)) return 14;
  return child.props.icon || child.props.leading ? 48 : 14;
}

export function AdminRow({
  icon,
  leading,
  title,
  subtitle,
  trailing,
  count,
  muted = false,
  onPress,
  chevron = !!onPress,
  accessibilityLabel,
  titleStyle,
}: {
  icon?: IconName;
  leading?: React.ReactNode;
  title: string;
  titleStyle?: TextStyle;
  subtitle?: string;
  trailing?: React.ReactNode;
  count?: number;
  muted?: boolean;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const content = (
    <>
      {leading ?? (icon ? <Ic name={icon} size={20} color={muted ? t.text3 : t.text2} strokeWidth={1.7} /> : null)}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: muted ? t.text2 : t.text }, titleStyle]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.rowSubtitle, { color: t.text3 }]}>{subtitle}</Text> : null}
      </View>
      {count && count > 0 ? <CountPill count={count} /> : null}
      {trailing}
      {chevron ? <Ic name="chevR" size={17} color={t.text3} strokeWidth={1.8} /> : null}
    </>
  );
  const style = ({ pressed }: { pressed: boolean }) => [
    styles.row,
    { backgroundColor: pressed ? t.surface2 : 'transparent' },
  ];

  if (!onPress) return <View style={styles.row}>{content}</View>;
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
  return (
    <View style={styles.status}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
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

function radius(value: string): number {
  return Number.parseFloat(value) || 16;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2, paddingTop: 7, paddingBottom: 3 },
  headerText: { flex: 1, minWidth: 0 },
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
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11.5, fontWeight: '600' },
  countPill: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontWeight: '700' },
});
