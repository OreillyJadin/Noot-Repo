import type { Href } from 'expo-router';
import type { Booking, Conversation } from '@noot/core';
import type { Tutor } from './data';
import { draftFromBooking } from './bookingDraft';
import type { BookingDraft, Role } from './store';

export const BOOKING_CHAT_NOTIFICATION_TITLES = new Set([
  'New session request',
  'New session booked',
  'Session confirmed',
]);

export interface NotificationTarget {
  role: Role;
  route: Href;
  draft?: Partial<BookingDraft>;
}

export function targetFor(
  n: { type: string; title: string; data: Record<string, unknown> },
  ctx: {
    uid: string;
    currentRole: Role;
    conversation?: Conversation | null;
    booking?: Booking | null;
    tutor?: Tutor | null;
    now?: number;
  },
): NotificationTarget {
  if (n.type === 'message') {
    const conversation = ctx.conversation;
    if (conversation?.kind === 'direct' && conversation.tutorId === ctx.uid) {
      return {
        role: 'tutor',
        route: '/chat_tutor',
        draft: { studentId: conversation.studentId ?? undefined },
      };
    }
    if (conversation?.kind === 'direct' && conversation.studentId === ctx.uid && ctx.tutor) {
      return { role: 'student', route: '/chat', draft: { tutor: ctx.tutor } };
    }
    return { role: ctx.currentRole, route: '/notifications' };
  }

  if (n.type === 'booking') {
    const booking = ctx.booking;
    if (!booking) {
      return {
        role: ctx.currentRole,
        route: ctx.currentRole === 'tutor' ? '/tutor_sessions' : '/sessions',
      };
    }

    const role: Role = booking.tutorId === ctx.uid ? 'tutor' : 'student';
    const isFuture = new Date(booking.scheduledAt).getTime() > (ctx.now ?? Date.now());

    // Notification row data only contains bookingId, so the server's notification title
    // identifies which booking events should open their conversation.
    if (BOOKING_CHAT_NOTIFICATION_TITLES.has(n.title)) {
      if (role === 'tutor') {
        return { role, route: '/chat_tutor', draft: draftFromBooking(booking) };
      }
      if (ctx.tutor) {
        return {
          role,
          route: '/chat',
          draft: { tutor: ctx.tutor, bookingId: booking.id },
        };
      }
    }

    if (role === 'tutor') {
      if (booking.status === 'pending') return { role, route: '/tutor_sessions' };
      if (booking.status === 'confirmed' && isFuture) {
        return { role, route: '/tb2', draft: draftFromBooking(booking) };
      }
      return { role, route: { pathname: '/tutor_sessions', params: { tab: 'past' } } };
    }

    if ((booking.status === 'pending' || booking.status === 'confirmed') && isFuture) {
      return { role, route: '/sessions' };
    }
    return { role, route: { pathname: '/sessions', params: { tab: 'past' } } };
  }

  if (n.type === 'system' && (n.data.interviewId || n.data.scheduledAt)) {
    return { role: 'tutor', route: '/tutor_home' };
  }

  return { role: ctx.currentRole, route: '/notifications' };
}
