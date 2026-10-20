import type { Notification } from '@noot/core';

export const BOOKING_CONFIRMED_TITLE = 'Session confirmed';
export const BOOKING_CONFIRMED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type BookingConfirmedNotification = Pick<Notification, 'id' | 'type' | 'title' | 'data' | 'createdAt'>;

export function selectUnseenBookingConfirmations(
  notifications: readonly BookingConfirmedNotification[],
  seenIds: ReadonlySet<string>,
  now = Date.now(),
): BookingConfirmedNotification[] {
  return notifications
    .filter((notification) => {
      if (
        notification.type !== 'booking' ||
        notification.title !== BOOKING_CONFIRMED_TITLE ||
        typeof notification.data.bookingId !== 'string' ||
        !notification.data.bookingId ||
        seenIds.has(notification.id)
      ) {
        return false;
      }
      const createdAt = new Date(notification.createdAt).getTime();
      const age = now - createdAt;
      return Number.isFinite(createdAt) && age >= 0 && age <= BOOKING_CONFIRMED_WINDOW_MS;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
