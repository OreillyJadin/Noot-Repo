import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatCampusTime, type AdminCalendarEvent } from '@noot/core';
import { ListRow as AdminRow, StatusDot, useLargeText, useTheme } from '@noot/ui';
import { INTERVIEW_MINUTES } from './interviewBlock';
import { splitClock } from './monthGrid';

export { LargeHeader as AdminLargeHeader, ListSection as AdminSection, ListRow as AdminRow, StatusDot, CountPill, STACK_FONT_SCALE } from '@noot/ui';

export const INTERVIEW_INDIGO = '#5B6CC2';
export const WARNING_AMBER = '#C2783A';

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
  const large = useLargeText();
  const muted = eventMuted(event);
  const color = eventColor(event, t);
  const time = formatCampusTime(event.startsAt);
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
        <View style={[styles.eventLeading, large && styles.eventLeadingLarge]}>
          <View style={[styles.eventTimeColumn, large && styles.eventLeadingLarge]}>
            <Text numberOfLines={1} style={[styles.eventTime, large && styles.eventLeadingLarge, { color: variant === 'hub' ? t.text : t.text3 }]}>{clock}</Text>
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

const styles = StyleSheet.create({
  eventLeading: { width: 58, flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventTimeColumn: { width: 44, flexShrink: 0 },
  eventTime: { width: 44, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  eventMeridiem: { fontSize: 11, lineHeight: 13 },
  eventLeadingLarge: { width: undefined },
  eventBar: { width: 3, height: 29, borderRadius: 2 },
  eventTrailing: { alignItems: 'flex-end', gap: 3 },
  eventDuration: { fontSize: 10 },
  hubEventStatus: { fontSize: 11, fontWeight: '600' },
});
