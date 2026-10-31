import type { Booking } from './models';

type SessionTiming = Pick<Booking, 'status' | 'scheduledAt' | 'durationMinutes'>;

// resolveBooking in _shared/booking.ts caps duration at 480 minutes.
export const SESSION_LOOKBACK_MS = 480 * 60_000;

export function sessionPhase(booking: SessionTiming, now = Date.now()): 'upcoming' | 'active' | 'ended' | null {
  if (booking.status !== 'confirmed') return null;
  const start = new Date(booking.scheduledAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(booking.durationMinutes) || booking.durationMinutes <= 0) return null;
  if (now < start) return 'upcoming';
  return now < start + booking.durationMinutes * 60_000 ? 'active' : 'ended';
}

export function isUpcomingSession(booking: SessionTiming, now = Date.now()): boolean {
  if (booking.status === 'pending') return new Date(booking.scheduledAt).getTime() >= now;
  const phase = sessionPhase(booking, now);
  return phase === 'upcoming' || phase === 'active';
}

export function isPastSession(booking: SessionTiming, now = Date.now()): boolean {
  return ['completed', 'cancelled', 'no_show'].includes(booking.status) || sessionPhase(booking, now) === 'ended';
}

export function canReportNoShow(booking: SessionTiming, now = Date.now()): boolean {
  const end = new Date(booking.scheduledAt).getTime() + booking.durationMinutes * 60_000;
  // Mirror report-no-show's current 48-hour window; the server remains authoritative.
  return sessionPhase(booking, now) === 'ended' && now <= end + 48 * 3_600_000;
}
