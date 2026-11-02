import type { Booking } from '@noot/core';

type VideoBooking = Pick<Booking, 'sessionType' | 'status' | 'scheduledAt' | 'durationMinutes' |
  'videoLinkSentAt' | 'dailyRoomName' | 'dailyRoomDeletedAt'>;

export function videoJoinState(b: VideoBooking | null, now: number) {
  const waiting = { enabled: false, label: 'Link arrives 1 hour before' };
  if (!b || b.sessionType !== 'video') return waiting;
  const start = new Date(b.scheduledAt).getTime();
  const end = start + (b.durationMinutes + 30) * 60_000;
  if (!Number.isFinite(start) || b.status !== 'confirmed' || b.dailyRoomDeletedAt) return waiting;
  if (now > end) return { enabled: false, label: 'Video session has ended' };
  if (now < start - 3_600_000 || !b.videoLinkSentAt || !b.dailyRoomName) return waiting;
  return { enabled: true, label: 'Join video session' };
}
