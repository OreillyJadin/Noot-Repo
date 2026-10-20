import type { Href, ImperativeRouter } from 'expo-router';
import { api, auth, type Booking, type Conversation, type NotificationType } from '@noot/core';
import { toTutor } from './data';
import { BOOKING_CHAT_NOTIFICATION_TITLES, targetFor } from './notificationTarget';
import { HOME } from './useRoleSwitch';
import { markBookingConfirmedSeen } from './BookingConfirmedHost';
import type { BookingDraft, Role } from './store';

interface OpenableNotification {
  id?: string;
  type: string;
  title: string;
  data: Record<string, unknown>;
}

interface OpenNotificationContext {
  router: ImperativeRouter;
  currentRole: Role;
  setRole: (role: Role) => void;
  patchBooking: (patch: Partial<BookingDraft>) => void;
}

export async function openNotification(
  n: OpenableNotification,
  ctx: OpenNotificationContext,
  opts: { fromPush: boolean },
): Promise<void> {
  let uid: string | null;
  try {
    uid = await auth.getSessionUserId();
  } catch {
    return;
  }
  if (!uid) return;
  if (n.type === 'booking' && n.title === 'Session confirmed' && typeof n.data.bookingId === 'string') {
    await markBookingConfirmedSeen(uid, n.id, n.data.bookingId);
  }

  let conversation: Conversation | null = null;
  let booking: Booking | null = null;
  let tutor: ReturnType<typeof toTutor> | null = null;
  if (n.type === 'message' && typeof n.data.conversationId === 'string') {
    try {
      conversation = await api.chat.getConversation(n.data.conversationId);
    } catch {
      conversation = null;
    }
    if (conversation?.studentId === uid && conversation.tutorId) {
      try {
        const summary = await api.tutors.getById(conversation.tutorId);
        tutor = summary ? toTutor(summary) : null;
      } catch {
        tutor = null;
      }
    }
  } else if (n.type === 'booking' && typeof n.data.bookingId === 'string') {
    try {
      booking = await api.bookings.get(n.data.bookingId);
    } catch {
      booking = null;
    }
    if (
      booking &&
      booking.tutorId !== uid &&
      BOOKING_CHAT_NOTIFICATION_TITLES.has(n.title)
    ) {
      try {
        const summary = await api.tutors.getById(booking.tutorId);
        tutor = summary ? toTutor(summary) : null;
      } catch {
        tutor = null;
      }
    }
  }

  const target = targetFor(n, { uid, currentRole: ctx.currentRole, conversation, booking, tutor });
  let replacedHome = false;
  if (target.role !== ctx.currentRole) {
    void api.profile.setActiveRole(target.role).catch(() => {});
    ctx.setRole(target.role);
    if (opts.fromPush) {
      ctx.router.replace(HOME[target.role] as Href);
      replacedHome = true;
    }
  }

  if (target.draft) ctx.patchBooking(target.draft);
  if (!(replacedHome && target.route === HOME[target.role])) {
    ctx.router.push(target.route);
  }

  if (opts.fromPush) {
    const data = { ...n.data };
    delete data.type;
    void api.notifications.markReadFor(n.type as NotificationType, data).catch(() => {});
  }
}
