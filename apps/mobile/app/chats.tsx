// Chats — the conversation list for both roles. Every booking opens a 1:1 thread at
// booking time (confirm-booking), so a brand-new pending request already sits here:
// the student sees it as "Awaiting response" until the tutor accepts or declines, and
// the tutor sees the student's opening message as a "New request". Tapping a row opens
// the thread on whichever side of that conversation the user is on.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, H1, TabBar, EmptyState, Skeleton, useTheme } from '@noot/ui';
import { api, auth } from '@noot/core';
import type { Booking, ConversationSummary } from '@noot/core';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { draftFromBooking, blankSessionFields } from '../lib/bookingDraft';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short list timestamp: clock time today, "Yesterday", then "Oct 4". */
function listTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Display name for the person on the other end of the thread. */
function counterpartName(c: ConversationSummary): string {
  const name = `${c.counterpart.firstName} ${c.counterpart.lastName}`.trim();
  return name || (c.side === 'student' ? 'Your tutor' : 'Student');
}

/** A Tutor the chat screen can render when the full profile can't be fetched. */
function fallbackTutor(c: ConversationSummary): Tutor {
  return {
    id: c.counterpart.id,
    name: counterpartName(c),
    year: '',
    major: '',
    rating: 0,
    sessions: 0,
    rate: 0,
    verified: false,
    verifiedGrade: '',
    next: 0,
    nextLabel: '',
    bio: '',
    courses: [['', '', 0, 0, false]],
  };
}

function TabHeader({ title }: { title: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
      <H1 style={styles.headerTitle}>{title}</H1>
    </View>
  );
}

export default function Chats() {
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();

  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  // Latest upcoming booking per counterpart — drives the pending-state badges and
  // gives the opened thread its session context.
  const [bookingBy, setBookingBy] = useState<Record<string, Booking>>({});
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  // Reload on every focus — a thread pushed on top can change the pair's state
  // (new messages, an accepted request) and the list must not come back stale.
  useFocusEffect(
    // reloadKey retriggers the focus callback after pull-to-refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      let active = true;
      Promise.all([
        api.chat.listConversations(),
        api.listUpcoming().catch(() => [] as Booking[]),
        auth.getSessionUserId().catch(() => null),
      ])
        .then(([convos, bookings, me]) => {
          if (!active) return;
          const byOther: Record<string, Booking> = {};
          for (const b of bookings) {
            const other = b.studentId === me ? b.tutorId : b.studentId;
            // listUpcoming is ascending by session time, so the first booking per
            // counterpart is the next one; a pending request outranks a confirmed
            // session since it's the state that still needs someone's response.
            const cur = byOther[other];
            if (!cur || (cur.status !== 'pending' && b.status === 'pending')) byOther[other] = b;
          }
          const sorted = [...convos].sort(
            (a, b) =>
              new Date(b.lastMessage?.createdAt ?? b.createdAt).getTime() -
              new Date(a.lastMessage?.createdAt ?? a.createdAt).getTime(),
          );
          setUid(me);
          setBookingBy(byOther);
          setRows(sorted);
        })
        .catch(() => { /* no session / offline → empty state */ })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [reloadKey]),
  );

  const open = async (c: ConversationSummary) => {
    if (opening) return;
    setOpening(c.id);
    try {
      const booking = bookingBy[c.counterpart.id];
      const session = booking ? draftFromBooking(booking) : {};
      if (c.side === 'student') {
        let tutor: Tutor | null = null;
        try {
          const summary = await api.tutors.getById(c.counterpart.id);
          if (summary) tutor = toTutor(summary);
        } catch { /* fallback below */ }
        patchBooking({
          ...blankSessionFields(),
          tutor: tutor ?? fallbackTutor(c),
          tutorId: c.counterpart.id,
          ...session,
        });
        router.push('/chat');
      } else {
        patchBooking({ ...blankSessionFields(), studentId: c.counterpart.id, ...session });
        router.push('/chat_tutor');
      }
    } finally {
      setOpening(null);
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  return (
    <Screen>
      <TabHeader title="Chats" />
      <Body ref={scrollRef} onRefresh={onRefresh} pad={20} contentStyle={{ paddingTop: 4 }}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={72} radius={16} />
            <Skeleton height={72} radius={16} />
            <Skeleton height={72} radius={16} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="chat"
            title="No chats yet"
            subtitle={
              role === 'tutor'
                ? 'When a student books you, your conversation shows up here.'
                : 'Book a tutor and your conversation shows up here — even while it\'s waiting on their response.'
            }
            actionLabel={role === 'tutor' ? undefined : 'Find a tutor'}
            onAction={role === 'tutor' ? undefined : () => router.replace('/student_home')}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((c) => {
              const name = counterpartName(c);
              const booking = bookingBy[c.counterpart.id];
              const pending = booking?.status === 'pending';
              const last = c.lastMessage;
              const mine = !!last && last.senderId === uid;
              const preview = last ? (last.content || 'Attachment') : 'No messages yet';
              return (
                <Card key={c.id} onPress={() => void open(c)} style={styles.row}>
                  <Avatar size={46} label={name.charAt(0)} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowHead}>
                      <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>{name}</Text>
                      <Text style={[styles.time, { color: t.text3 }]}>
                        {listTime(last?.createdAt ?? c.createdAt)}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.preview, { color: t.text3 }]}>
                      {mine ? `You: ${preview}` : preview}
                    </Text>
                    {pending ? (
                      <View style={styles.badgeRow}>
                        <Badge
                          label={
                            c.side === 'student'
                              ? c.counterpart.firstName.trim()
                                ? `Awaiting ${c.counterpart.firstName.trim()}'s response`
                                : 'Awaiting response'
                              : 'New request'
                          }
                          tone="accentSoft"
                        />
                      </View>
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Body>
      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexShrink: 0, paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 30 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  time: { fontSize: 12, flexShrink: 0 },
  preview: { fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 8 },
});
