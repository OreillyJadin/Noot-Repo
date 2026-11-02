export function rateAtPosition(position: number, width: number, min: number, max: number): number | null {
  if (!Number.isFinite(position) || !Number.isFinite(width) || width <= 0) return null;
  const fraction = Math.min(1, Math.max(0, position / width));
  return Math.min(max, Math.max(min, min + Math.round(fraction * (max - min))));
}

export function adjustedRate(value: number, direction: 'increment' | 'decrement', min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value) + (direction === 'increment' ? 1 : -1)));
}
