import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { api, type Notification } from '@noot/core';
import { selectUnseenBookingConfirmations } from './bookingConfirmed';
import { useApp } from './store';
import { useMe } from './useMe';

const SEEN_KEY = 'noot.bookingConfirmedSeen';
const openedBookings = new Set<string>();

function seenKey(userId: string): string {
  return `${SEEN_KEY}.${userId}`;
}

async function readSeenIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(seenKey(userId));
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

async function persistSeenIds(userId: string, ids: string[], bookingIds: string[] = []): Promise<void> {
  for (const bookingId of bookingIds) openedBookings.add(`${userId}:${bookingId}`);
  if (!ids.length) return;
  try {
    const seen = await readSeenIds(userId);
    ids.forEach((id) => seen.add(id));
    await AsyncStorage.setItem(seenKey(userId), JSON.stringify([...seen]));
  } catch {
    /* best effort */
  }
}

function isConfirmedNotificationFor(
  notification: Notification,
  bookingId: string,
): boolean {
  return notification.type === 'booking' &&
    notification.title === 'Session confirmed' &&
    notification.data.bookingId === bookingId;
}

export async function markBookingConfirmedSeen(
  userId: string,
  notificationId?: string,
  bookingId?: string,
): Promise<void> {
  if (!userId) return;
  if (bookingId) openedBookings.add(`${userId}:${bookingId}`);
  const ids = notificationId ? [notificationId] : [];
  if (bookingId) {
    const notifications = await api.notifications.list().catch(() => []);
    ids.push(...notifications.filter((n) => isConfirmedNotificationFor(n, bookingId)).map((n) => n.id));
  }
  await persistSeenIds(userId, [...new Set(ids)], bookingId ? [bookingId] : []);
}

export function BookingConfirmedHost() {
  const router = useRouter();
  const { role } = useApp();
  const { me, loading } = useMe();
  const inFlight = useRef(false);
  const queuedRun = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (loading || !me?.id || role !== 'student') return;
    let active = true;
    const run = async () => {
      if (!active) return;
      if (inFlight.current) {
        queuedRun.current = () => { void run(); };
        return;
      }
      inFlight.current = true;
      try {
        const [notifications, seenIds] = await Promise.all([
          api.notifications.list(),
          readSeenIds(me.id),
        ]);
        if (!active) return;
        const matches = selectUnseenBookingConfirmations(notifications, seenIds)
          .filter((notification) => !openedBookings.has(`${me.id}:${notification.data.bookingId as string}`));
        if (!matches.length) return;
        const newest = matches[0]!;
        const bookingIds = matches.map((notification) => notification.data.bookingId as string);
        await persistSeenIds(me.id, matches.map((notification) => notification.id), bookingIds);
        if (active) {
          router.push({ pathname: '/b5', params: { bookingId: newest.data.bookingId as string } });
        }
      } catch {
        /* retry on the next foreground or role change */
      } finally {
        inFlight.current = false;
        const nextRun = queuedRun.current;
        queuedRun.current = null;
        nextRun?.();
      }
    };
    void run();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => {
      active = false;
      appState.remove();
    };
  }, [loading, me?.id, role, router]);

  return null;
}
