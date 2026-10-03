// Notification center — the signed-in user's in-app feed (0014). Lists notifications
// newest-first, styles unread ones, marks everything read on open (clears the bell
// badge), and routes to the relevant screen on tap. Rows are created by DB triggers.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Ic, EmptyState, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api, type Notification } from '@noot/core';
import { useApp } from '../lib/store';

const ICON: Record<Notification['type'], IconName> = { message: 'chat', booking: 'cal', system: 'bell' };

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

export default function Notifications() {
  const t = useTheme();
  const router = useRouter();
  const { role } = useApp();
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    let active = true;
    api.notifications
      .list()
      .then((list) => {
        if (!active) return;
        setItems(list);
        // Opening the center marks everything seen — clears the bell badge next time.
        api.notifications.markAllRead().catch(() => {});
      })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  const open = (n: Notification) => {
    if (n.type === 'message') router.push(role === 'tutor' ? '/chat_tutor' : '/chat');
    else if (n.type === 'booking') router.push(role === 'tutor' ? '/tutor_sessions' : '/sessions');
    // An interview notice (0042) → the tutor home, whose banner shows the time and place.
    else if (n.type === 'system' && n.data?.interviewId) router.push('/tutor_home');
  };

  return (
    <Screen>
      <NavTop title="Notifications" onBack={() => router.back()} />
      <Body pad={16}>
        {items === null ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title="No notifications yet" subtitle="Messages and new bookings will show up here." />
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((n) => {
              const unread = !n.readAt;
              return (
                <Card key={n.id} onPress={() => open(n)} style={styles.row}>
                  <View style={[styles.iconBox, { backgroundColor: unread ? t.accentWeak : t.surface2 }]}>
                    <Ic name={ICON[n.type]} size={18} color={unread ? t.accent : t.text3} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: t.text, fontWeight: unread ? '700' : '600' }]} numberOfLines={1}>
                        {n.title}
                      </Text>
                      {unread ? <View style={[styles.dot, { backgroundColor: t.accent }]} /> : null}
                    </View>
                    {n.body ? (
                      <Text style={[styles.body, { color: t.text3 }]} numberOfLines={2}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text style={[styles.time, { color: t.text3 }]}>{timeAgo(n.createdAt)}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 12, marginTop: 4 },
});
