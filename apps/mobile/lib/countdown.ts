// Pure countdown math shared by the "Your next session" cards. `started` is true
// once the target is at/past now; d/h/m are floored whole days, hours, minutes.
export function countdownParts(target: number, now: number): { d: number; h: number; m: number; started: boolean } {
  if (target <= now) return { d: 0, h: 0, m: 0, started: true };
  let ms = target - now;
  const d = Math.floor(ms / 86400000);
  ms -= d * 86400000;
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  return { d, h, m, started: false };
}
