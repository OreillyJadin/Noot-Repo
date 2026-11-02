import { countdownParts } from './countdown';

export function countdownLabel(target: number, endsAt: number | undefined, now: number): string {
  if (target <= now) {
    if (endsAt != null && now < endsAt) {
      const minutes = Math.ceil((endsAt - now) / 60_000);
      return `In progress · ends in ${minutes} min`;
    }
    return endsAt == null ? 'Starting now' : 'Session ended';
  }

  const { d, h, m } = countdownParts(target, now);
  if (d > 0) return `In ${d} day${d === 1 ? '' : 's'}${h > 0 ? `, ${h} hr` : ''}`;
  if (h > 0) return `In ${h} hr${m > 0 ? `, ${m} min` : ''}`;
  if (m > 0) return `In ${m} min`;
  return 'Starting now';
}
