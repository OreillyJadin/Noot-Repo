import type { Booking } from '@noot/core';

export function isDeferredCheckout(scheduledAt: string | null | undefined, now = Date.now()): boolean {
  return !!scheduledAt && Date.parse(scheduledAt) > now + 6 * 86400000;
}

export function needsPaymentUpdate(booking: Pick<Booking, 'status' | 'holdFailedAt' | 'stripePaymentIntentId'>): boolean {
  return (booking.status === 'pending' || booking.status === 'confirmed') &&
    !!booking.holdFailedAt && !booking.stripePaymentIntentId;
}

export function canUpdatePayment(scheduledAt: string, now = Date.now()): boolean {
  return Date.parse(scheduledAt) > now + 12 * 3600000;
}
