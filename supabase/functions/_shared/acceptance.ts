export const MIN_BOOKING_LEAD_HOURS = 2;
export const CHECKOUT_GRACE_MINUTES = 15;
export const ACCEPT_WINDOW_HOURS = 12;
export const ACCEPT_CUTOFF_HOURS = 2;
export const SHORT_NOTICE_ACCEPT_CUTOFF_HOURS = 1;
export const SHORT_NOTICE_HOURS = 3;

export function acceptDeadline(nowMs: number, scheduledAtMs: number): Date {
  const hourMs = 60 * 60 * 1000;
  const windowDeadline = nowMs + ACCEPT_WINDOW_HOURS * 60 * 60 * 1000;
  const cutoffDeadline = scheduledAtMs - ACCEPT_CUTOFF_HOURS * 60 * 60 * 1000;
  const normalDeadline = Math.min(windowDeadline, cutoffDeadline);
  if (normalDeadline - nowMs >= SHORT_NOTICE_ACCEPT_CUTOFF_HOURS * hourMs) {
    return new Date(normalDeadline);
  }
  return new Date(scheduledAtMs - SHORT_NOTICE_ACCEPT_CUTOFF_HOURS * hourMs);
}
