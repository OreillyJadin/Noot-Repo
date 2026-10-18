import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import type { AdminCalendarEvent } from '@noot/core';
import { Ic, useTheme, type IconName } from '@noot/ui';
import { INTERVIEW_MINUTES } from './interviewBlock';
import { splitClock } from './monthGrid';

export const INTERVIEW_INDIGO = '#5B6CC2';
export const WARNING_AMBER = '#C2783A';

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

// Above this font scale (iOS AX sizes, Android "largest") a trailing action beside the text
// squeezes the subtitle into mid-word breaks, so the row stacks: text on top, actions below.
export const STACK_FONT_SCALE = 1.5;

export function AdminRow({
  icon,
  leading,
  title,
  titleLines = 1,
  subtitle,
  subtitleLines = 1,
  detail,
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
}) {
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
        style={[styles.rowTitle, { color: muted ? t.text2 : t.text }, titleStyle]}
      >
        {title}
      </Text>
      {subtitle ? <Text numberOfLines={(stacked ? 0 : subtitleLines) || undefined} style={[styles.rowSubtitle, { color: t.text3 }]}>{subtitle}</Text> : null}
      {detail ? <View style={styles.rowDetail}>{detail}</View> : null}
    </View>
  );
  const lead = leading ?? (icon ? <Ic name={icon} size={20} color={muted ? t.text3 : t.text2} strokeWidth={1.7} /> : null);
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

export function eventMuted(event: AdminCalendarEvent): boolean {
  return event.kind === 'booking' && (event.status === 'cancelled' || event.status === 'no_show');
}

export function eventColor(event: AdminCalendarEvent, t: ReturnType<typeof useTheme>): string {
  if (event.disputeStatus === 'flagged') return WARNING_AMBER;
  if (event.kind === 'interview') return INTERVIEW_INDIGO;
  return eventMuted(event) ? t.text3 : t.accent;
}

export function statusLabel(event: AdminCalendarEvent): string {
  if (event.disputeStatus === 'flagged') return 'Disputed';
  if (event.kind === 'interview') return 'Interview';
  switch (event.status) {
    case 'cancelled': return 'Cancelled';
    case 'no_show': return 'No-show';
    case 'pending': return 'Pending';
    case 'confirmed': return 'Confirmed';
    case 'completed': return 'Completed';
    default: return event.status?.replaceAll('_', ' ') ?? 'Booking';
  }
}

export function CalendarEventRow({
  event,
  onPress,
  variant = 'calendar',
}: {
  event: AdminCalendarEvent;
  onPress: () => void;
  variant?: 'calendar' | 'hub';
}) {
  const t = useTheme();
  const muted = eventMuted(event);
  const color = eventColor(event, t);
  const time = new Date(event.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const { clock, meridiem } = splitClock(time);
  const duration = event.kind === 'interview' ? `${INTERVIEW_MINUTES} min` : event.minutes ? `${event.minutes} min` : null;
  const title = variant === 'hub' && event.kind === 'interview'
    ? `Interview · ${event.tutorName}`
    : event.title;
  const subtitle = variant === 'hub'
    ? event.kind === 'interview'
      ? event.details || `Tutor interview · ${INTERVIEW_MINUTES} min`
      : `${event.studentName ?? 'Student'} → ${event.tutorName}`
    : event.kind === 'interview'
      ? [event.details, event.tutorName].filter(Boolean).join(' · ') || 'Tutor interview'
      : [event.studentName, event.tutorName].filter(Boolean).join(' → ');
  const label = statusLabel(event);
  const showHubStatus = variant === 'hub' && event.kind === 'booking' && (event.status !== null || event.disputeStatus === 'flagged');

  return (
    <AdminRow
      leading={
        <View style={styles.eventLeading}>
          <View style={styles.eventTimeColumn}>
            <Text numberOfLines={1} style={[styles.eventTime, { color: variant === 'hub' ? t.text : t.text3 }]}>{clock}</Text>
            {meridiem ? <Text numberOfLines={1} style={[styles.eventMeridiem, { color: t.text3 }]}>{meridiem}</Text> : null}
          </View>
          <View style={[styles.eventBar, { backgroundColor: color }]} />
        </View>
      }
      title={title}
      titleStyle={muted ? { textDecorationLine: 'line-through' } : undefined}
      subtitle={subtitle}
      detail={showHubStatus ? (
        <Text style={[styles.hubEventStatus, { color: event.disputeStatus === 'flagged' ? WARNING_AMBER : muted ? t.text3 : t.good }]}>
          {label}
        </Text>
      ) : undefined}
      muted={muted}
      onPress={onPress}
      accessibilityLabel={`${label}: ${title}, ${subtitle}, ${time}`}
      trailing={variant === 'hub' ? undefined : (
        <View style={styles.eventTrailing}>
          {duration ? <Text style={[styles.eventDuration, { color: t.text3 }]}>{duration}</Text> : null}
          <StatusDot label={label} color={color} />
        </View>
      )}
    />
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
  rowStack: { flex: 1, minWidth: 0, gap: 8 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  rowDetail: { marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11.5, fontWeight: '600' },
  countPill: { minWidth: 22, minHeight: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontWeight: '700' },
  eventLeading: { width: 58, flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventTimeColumn: { width: 44, flexShrink: 0 },
  eventTime: { width: 44, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  eventMeridiem: { fontSize: 11, lineHeight: 13 },
  eventBar: { width: 3, height: 29, borderRadius: 2 },
  eventTrailing: { alignItems: 'flex-end', gap: 3 },
  eventDuration: { fontSize: 10 },
  hubEventStatus: { fontSize: 11, fontWeight: '600' },
});
