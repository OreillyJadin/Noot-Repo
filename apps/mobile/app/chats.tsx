// Chats — the conversation inbox for both roles. Every row is a real
// conversation confirm-booking created when the student booked (or the student
// started from a tutor profile), so a booking's chat exists from the moment the
// session is requested — pending requests show a "Pending" badge until the
// tutor answers. Backed by api.chat.listConversations(); tapping routes to the
// role's thread screen with the right booking draft.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, H1, TabBar, EmptyState, Skeleton, Ic, useTheme } from '@noot/ui';
import { api, type ConversationSummary } from '@noot/core';
import { useApp } from '../lib/store';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { toTutor } from '../lib/data';
import { formatSessionTime } from '../lib/formatSessionTime';

interface ChatRow {
  conversation: ConversationSummary;
  /** Resolved display name — RLS can blank student names in listConversations,
   * so the tutor side tops up from resolve-participants. */
  name: string;
  /** A live booking with this counterpart is still awaiting a response. */
  pending: boolean;
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
  const { role, patchBooking } = useApp();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.chat.listConversations(),
      // Booking counterparties — RLS only lets a student read tutor rows, so a
      // tutor's list comes back with blank student names without this.
      api.resolveParticipantNames().catch(() => ({} as Record<string, { firstName: string; lastName: string }>)),
      api.listUpcoming().catch(() => []),
    ])
      .then(([convos, names, upcoming]) => {
        if (!active) return;
        const items = convos.map((c): ChatRow => {
          const resolved = names[c.counterpart.id];
          const name =
            `${c.counterpart.firstName} ${c.counterpart.lastName}`.trim() ||
            (resolved ? `${resolved.firstName} ${resolved.lastName}`.trim() : '') ||
            'Unknown';
          return {
            conversation: c,
            name,
            pending: upcoming.some(
              (b) =>
                b.status === 'pending' &&
                (b.studentId === c.counterpart.id || b.tutorId === c.counterpart.id),
            ),
          };
        });
        items.sort((a, b) => {
          const at = a.conversation.lastMessage?.createdAt ?? a.conversation.createdAt;
          const bt = b.conversation.lastMessage?.createdAt ?? b.conversation.createdAt;
          return Date.parse(bt) - Date.parse(at);
        });
        setRows(items);
      })
      .catch(() => { /* no session / offline → empty state */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const openChat = async (row: ChatRow) => {
    if (role === 'tutor') {
      patchBooking({ studentId: row.conversation.counterpart.id });
      router.push('/chat_tutor');
      return;
    }
    try {
      const summary = await api.tutors.getById(row.conversation.counterpart.id);
      if (!summary) throw new Error('tutor not found');
      patchBooking({ tutor: toTutor(summary) });
    } catch {
      // The thread exists even when the tutor profile can't be loaded (e.g. they
      // left tutoring) — a stub keeps the conversation open instead of dead-ending.
      patchBooking({
        tutor: {
          id: row.conversation.counterpart.id,
          name: row.name,
          year: '', major: '', rating: 0, sessions: 0, rate: 0,
          verified: false, verifiedGrade: '', next: 0, nextLabel: '', bio: '', courses: [],
        },
      });
    }
    router.push('/chat');
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
                : 'Book a tutor and your conversation shows up here.'
            }
            actionLabel={role === 'tutor' ? undefined : 'Find a tutor'}
            onAction={role === 'tutor' ? undefined : () => router.replace('/student_home')}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((row) => {
              const last = row.conversation.lastMessage;
              const preview = last?.content?.trim() ||
                (last?.attachments?.length ? 'Attachment' : 'Say hi to start the conversation');
              const when = last?.createdAt ?? row.conversation.createdAt;
              return (
                <Card key={row.conversation.id} onPress={() => void openChat(row)} style={styles.row}>
                  <Avatar size={46} label={row.name.charAt(0)} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowHead}>
                      <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>{row.name}</Text>
                      <Text style={[styles.time, { color: t.text3 }]}>{formatSessionTime(when)}</Text>
                    </View>
                    <View style={styles.rowSub}>
                      <Text numberOfLines={1} style={[styles.preview, { color: t.text3 }]}>{preview}</Text>
                      {row.pending ? <Badge label="Pending" tone="accentSoft" /> : null}
                    </View>
                  </View>
                  <Ic name="chevR" size={16} color={t.text3} strokeWidth={2} />
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
  rowSub: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  time: { fontSize: 11.5 },
  preview: { fontSize: 13, flex: 1, minWidth: 0 },
});
