export const ACCEPT_WINDOW_HOURS = 12;
export const ACCEPT_CUTOFF_HOURS = 2;
export const SHORT_NOTICE_HOURS = 3;

export function acceptDeadline(nowMs: number, scheduledAtMs: number): Date {
  const windowDeadline = nowMs + ACCEPT_WINDOW_HOURS * 60 * 60 * 1000;
  const cutoffDeadline = scheduledAtMs - ACCEPT_CUTOFF_HOURS * 60 * 60 * 1000;
  const deadline = Math.min(windowDeadline, cutoffDeadline);
  return new Date(deadline <= nowMs ? scheduledAtMs : deadline);
}
