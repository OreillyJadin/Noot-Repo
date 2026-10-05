// TC · Tutor Calendar — ported from screens-calendar.jsx (TutorCalendar).
// Booked sessions + availability on ONE weekly surface: pick a day, then tap any
// empty time to open/close it for booking. Sessions are tappable -> TB2 detail.
// This is a tutor tab root (TabBar persists across tutor_home/tutor_calendar/
// tutor_sessions/tutor_profile).
// An interview the noot team has scheduled with the tutor sits on the same surface in its
// own colour, and the times it covers are not shown as open (ERR-032).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, TabBar, Card, Avatar, Ic, Label, useTheme } from '@noot/ui';
import { api, type TutorInterview } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe } from '../lib/useMe';
import { DAYS, MONTHS } from '../lib/data';
import { isTimeOpen } from '../lib/availability';
import { GeckoLogo } from '../lib/GeckoLogo';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { INTERVIEW_MINUTES, interviewBlockedSlots, interviewRange } from '../lib/interviewBlock';

// Something the noot team put on the calendar, not the tutor or a student: neither the
// accent of open times nor the green of a booked session's pay.
const ADMIN_EVENT = '#5B6CC2';
const ADMIN_EVENT_WEAK = 'rgba(91,108,194,0.14)';

const CAL_TIMES = ['9:00 AM', '10:30 AM', '12:00 PM', '1:30 PM', '3:00 PM', '4:30 PM', '6:00 PM', '7:30 PM'];

interface CalSession {
  name: string;
  av: string;
  course: string;
  where: string;
  pay: string;
  len: string;
}

// Format a booking time into the same slot labels the grid renders (CAL_TIMES).
function slotLabel(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// Duration minutes -> friendly length label.
function lenLabel(min: number): string {
  if (min % 60 === 0) return `${min / 60} hr`;
  if (min > 60) return `${Math.floor(min / 60)} hr ${min % 60} min`;
  return `${min} min`;
}

// Map the booking's date to an index into the fixed 14-day DAYS window (or null if outside it).
function dayIndexFor(d: Date): number | null {
  const hit = DAYS.find((x) => x.dom === d.getDate() && x.month === MONTHS[d.getMonth()]);
  return hit ? hit.i : null;
}

const WEEK_TABS: [number, string][] = [
  [0, 'This week'],
  [1, 'Next week'],
];

export default function TutorCalendar() {
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useApp();
  const { me } = useMe();

  const [week, setWeek] = useState(0); // 0 = this week · 1 = next week
  const [day, setDay] = useState(1); // selected index into DAYS
  // Open/closeable slots per day, seeded from the tutor's real weekly availability.
  const [open, setOpen] = useState<Record<number, Set<string>>>({});
  // Booked sessions on the grid: live from api.listUpcoming().
  const [sessionsByDay, setSessionsByDay] = useState<Record<number, Record<string, CalSession>>>({});

  // Seed the open-slot grid from the signed-in tutor's real weekly availability:
  // for each calendar day, mark the CAL_TIMES that fall inside a saved window.
  useEffect(() => {
    if (!me) return;
    let active = true;
    api.tutors
      .getAvailability(me.id)
      .then((windows) => {
        if (!active) return;
        const map: Record<number, Set<string>> = {};
        for (const d of DAYS) {
          map[d.i] = new Set(CAL_TIMES.filter((time) => isTimeOpen(windows, d.dowNum, time)));
        }
        setOpen(map);
      })
      .catch(() => {});
    return () => { active = false; };
    // Keyed on the id, not the object: useMe re-reads in the background (S1), and
    // re-seeding on every re-read would wipe edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    let active = true;
    api
      .listUpcoming()
      .then((bookings) => {
        if (!active || bookings.length === 0) return; // no sessions → grid stays empty (no fallback data)
        const byDay: Record<number, Record<string, CalSession>> = {};
        for (const b of bookings) {
          const at = new Date(b.scheduledAt);
          const di = dayIndexFor(at);
          if (di == null) continue; // outside the visible 14-day window
          const online = b.sessionType === 'video';
          (byDay[di] ??= {})[slotLabel(at)] = {
            // TODO(api): a booking exposes only studentId; no read endpoint resolves a student's name.
            name: 'Student',
            av: 'S',
            course: b.subject,
            // Plain "Online": noot hosts no video, and video sessions aren't sold at
            // launch (T14). Only pre-existing rows can be 'video'.
            where: online ? 'Online' : (b.location ?? 'In person'),
            pay: `$${Math.round(b.tutorPayoutAmount)}`,
            len: lenLabel(b.durationMinutes),
          };
        }
        setSessionsByDay(byDay);
      })
      .catch(() => { /* offline → grid stays empty rather than showing invented sessions */ });
    return () => { active = false; };
  }, [reloadKey]);

  // The tutor's live interview with the noot team, if one is set (RLS: their own only).
  const [interview, setInterview] = useState<TutorInterview | null>(null);
  useEffect(() => {
    let active = true;
    api.profile
      .getMyInterview()
      .then((iv) => { if (active) setInterview(iv); })
      .catch(() => { /* offline → no interview shown, same as the sessions above */ });
    return () => { active = false; };
  }, [reloadKey]);
  // Which day of the visible two weeks it falls on, and the rows it takes up there.
  // An interview that is over comes off the calendar, though its row stays live until the
  // application is decided (the "in review" banner drops it the same way).
  const interviewAt = useMemo(() => {
    if (!interview) return null;
    const at = new Date(interview.scheduledAt);
    return at.getTime() + INTERVIEW_MINUTES * 60 * 1000 > Date.now() ? at : null;
  }, [interview]);
  const interviewDay = interviewAt ? dayIndexFor(interviewAt) : null;
  const interviewSlots = useMemo(
    () => new Set(interviewAt ? interviewBlockedSlots(interviewAt, CAL_TIMES) : []),
    [interviewAt],
  );
  const blocked = (dayIndex: number, time: string) => interviewDay === dayIndex && interviewSlots.has(time);

  const days = DAYS.slice(week * 7, week * 7 + 7);
  const sessions = sessionsByDay[day] || {};
  const openSet = open[day] || new Set<string>();
  const dayObj = DAYS.find((d) => d.i === day) || DAYS[0]!;

  // This grid is a read-only view of the tutor's recurring availability. Editing it here
  // used to be local-only and was silently lost on reload, so it now routes to
  // edit_availability, which persists through api.profile.updateAvailability().
  const editAvailability = () => {
    router.push('/edit_availability' as never);
  };
  const pickWeek = (w: number) => {
    setWeek(w);
    setDay(w * 7);
  };
  // TODO(api): CalSession carries no booking id yet, so tb2 can't load this exact
  // session — navigate to the tutor-side detail; it reads real data via listUpcoming.
  const openDetail = () => {
    router.push('/tb2' as never);
  };

  const scrollRef = useRef<ScrollView>(null);
  // Re-tapping Calendar snaps back to this-week / default day + scrolls to top.
  const { active, onTab } = useTabNav({
    scrollRef,
    onReselect: () => {
      setWeek(0);
      setDay(1);
    },
  });

  const stats = useMemo(() => {
    let o = 0;
    let b = 0;
    days.forEach((d) => {
      // A time the interview covers is not open, whatever the weekly availability says.
      o += [...(open[d.i] || new Set<string>())].filter((time) => !blocked(d.i, time)).length;
      b += Object.keys(sessionsByDay[d.i] || {}).length;
    });
    return { o, b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, week, sessionsByDay, interviewDay, interviewSlots]);

  return (
    <Screen>
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: t.text }]}>Calendar</Text>
          <GeckoLogo size={18} />
        </View>

        {/* week switch */}
        <View style={[styles.weekSwitch, { backgroundColor: t.surface2 }]}>
          {WEEK_TABS.map(([v, l]) => {
            const on = week === v;
            return (
              <Pressable
                key={v}
                onPress={() => pickWeek(v)}
                style={[
                  styles.weekSeg,
                  { backgroundColor: on ? t.surface : 'transparent' },
                  on && styles.weekSegShadow,
                ]}
              >
                <Text style={[styles.weekSegLabel, { color: on ? t.text : t.text3 }]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* day strip — dot = booked session, count = open times */}
        <View style={styles.dayStrip}>
          {days.map((d) => {
            const on = day === d.i;
            const booked = Object.keys(sessionsByDay[d.i] || {}).length > 0;
            const nOpen = [...(open[d.i] || new Set<string>())].filter((time) => !blocked(d.i, time)).length;
            return (
              <Pressable
                key={d.i}
                onPress={() => setDay(d.i)}
                style={[
                  styles.dayCell,
                  { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.border },
                ]}
              >
                <Text style={[styles.dayDow, { color: on ? t.onAccent : t.text3 }]}>{d.dow}</Text>
                <Text style={[styles.dayDom, { color: on ? t.onAccent : t.text }]}>{d.dom}</Text>
                <View style={styles.dayDots}>
                  {booked && (
                    <View style={[styles.dot, { backgroundColor: on ? t.onAccent : t.accent }]} />
                  )}
                  {interviewDay === d.i && (
                    // A square, so it still reads apart from the round dots on the selected day,
                    // where every marker is the same light colour.
                    <View style={[styles.dot, { borderRadius: 1, backgroundColor: on ? t.onAccent : ADMIN_EVENT }]} />
                  )}
                  {nOpen > 0 && (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: on ? 'rgba(255,255,255,0.55)' : t.good, opacity: 0.9 },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* weekly summary */}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, { color: t.text3 }]}>
            <Text style={[styles.summaryStrong, { color: t.text }]}>{stats.b}</Text> booked ·{' '}
            <Text style={[styles.summaryStrong, { color: t.text }]}>{stats.o}</Text> open this week
          </Text>
          <Text onPress={editAvailability} style={[styles.copyLink, { color: t.accent }]}>
            Edit availability
          </Text>
        </View>
      </View>

      <Body ref={scrollRef} onRefresh={onRefresh} pad={20} contentStyle={{ paddingTop: 12 }}>
        <Label style={{ fontSize: 13, marginBottom: 10 }}>{dayObj.label}</Label>
        {interview && interviewAt && interviewDay === day ? (
          <View style={[styles.interviewCard, { backgroundColor: ADMIN_EVENT_WEAK, borderColor: ADMIN_EVENT }]}>
            <View style={[styles.interviewIcon, { backgroundColor: ADMIN_EVENT }]}>
              <Ic name="cal" size={16} color="#FFFFFF" strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.sessionName, { color: t.text }]}>Interview with noot</Text>
              <Text style={[styles.sessionMeta, { color: t.text2, marginTop: 2 }]}>
                {interviewRange(interviewAt)}
                {interview.details ? ` · ${interview.details}` : ''}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          {CAL_TIMES.map((time) => {
            const s = sessions[time];
            const isBlocked = blocked(day, time);
            const isOpen = openSet.has(time) && !isBlocked;
            return (
              <View key={time} style={styles.slotRow}>
                <Text
                  style={[
                    styles.slotTime,
                    { color: s ? t.text : isOpen ? t.text2 : t.text3 },
                  ]}
                >
                  {time}
                </Text>
                {s ? (
                  <Card onPress={openDetail} style={styles.sessionCard}>
                    <Avatar size={36} label={s.av} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.sessionTopRow}>
                        <Text numberOfLines={1} style={[styles.sessionName, { color: t.text }]}>
                          {s.name}
                        </Text>
                        <Text style={[styles.sessionPay, { color: t.good }]}>{s.pay}</Text>
                      </View>
                      <View style={styles.sessionMetaRow}>
                        <Ic name={s.where.startsWith('Online') ? 'video' : 'pin'} size={12} color={t.accent} strokeWidth={1.8} />
                        <Text numberOfLines={1} style={[styles.sessionMeta, { color: t.text3 }]}>
                          {s.course} · {s.len}
                        </Text>
                      </View>
                    </View>
                    <Ic name="chevR" size={16} color={t.text3} strokeWidth={2} />
                  </Card>
                ) : isBlocked ? (
                  <View style={[styles.openSlot, { backgroundColor: ADMIN_EVENT_WEAK, borderColor: ADMIN_EVENT }]}>
                    <View style={styles.openSlotLeft}>
                      <View style={[styles.dotSm, { backgroundColor: ADMIN_EVENT }]} />
                      <Text style={[styles.openSlotLabel, { color: t.text }]}>Interview with noot</Text>
                    </View>
                    <Text style={[styles.openSlotHint, { color: t.text3 }]}>Not bookable</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={editAvailability}
                    style={[
                      styles.openSlot,
                      {
                        backgroundColor: isOpen ? t.accentWeak : t.surface,
                        borderColor: isOpen ? t.accentBorder : t.borderStrong,
                        borderStyle: isOpen ? 'solid' : 'dashed',
                        opacity: isOpen ? 1 : 0.6,
                      },
                    ]}
                  >
                    <View style={styles.openSlotLeft}>
                      <View style={[styles.dotSm, { backgroundColor: isOpen ? t.good : t.borderStrong }]} />
                      <Text style={[styles.openSlotLabel, { color: isOpen ? t.accent : t.text3 }]}>
                        {isOpen ? 'Open for booking' : 'Closed'}
                      </Text>
                    </View>
                    <Text style={[styles.openSlotHint, { color: t.text3 }]}>
                      {isOpen ? 'Tap to close' : 'Tap to open'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.footnote}>
          <View style={{ marginTop: 1 }}>
            <Ic name="bolt" size={14} color={t.accent} strokeWidth={1.8} />
          </View>
          <Text style={[styles.footnoteText, { color: t.text3 }]}>
            Open times are instantly bookable by students. Booked sessions can be rescheduled from their detail view.
          </Text>
        </View>
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  weekSwitch: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 16, marginTop: 14, marginBottom: 12 },
  weekSeg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 14 },
  weekSegShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  weekSegLabel: { fontSize: 14, fontWeight: '600' },
  dayStrip: { flexDirection: 'row', gap: 6 },
  dayCell: { flex: 1, paddingTop: 8, paddingBottom: 7, borderRadius: 13, alignItems: 'center', borderWidth: 1.5 },
  dayDow: { fontSize: 10, fontWeight: '600' },
  dayDom: { fontSize: 16, fontWeight: '700', marginTop: 1 },
  dayDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 4, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 4 },
  summaryText: { fontSize: 12.5 },
  summaryStrong: { fontWeight: '700' },
  copyLink: { fontSize: 12.5, fontWeight: '600' },
  slotRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  slotTime: { width: 60, flexShrink: 0, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  sessionCard: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  sessionTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  sessionName: { fontSize: 14, fontWeight: '600' },
  sessionPay: { fontSize: 13, fontWeight: '700' },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sessionMeta: { fontSize: 12 },
  openSlot: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openSlotLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dotSm: { width: 7, height: 7, borderRadius: 3.5 },
  openSlotLabel: { fontSize: 13, fontWeight: '600' },
  openSlotHint: { fontSize: 11.5 },
  interviewCard: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 },
  interviewIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  footnote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, paddingHorizontal: 2 },
  footnoteText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
