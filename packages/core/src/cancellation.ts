export function studentCancelRefundPercent(
  hoursUntilStart: number,
  lockedRefundPercent: 0 | 50 | null = null,
): 0 | 50 | 100 {
  const tier = hoursUntilStart >= 12 ? 100 : hoursUntilStart >= 2 ? 50 : 0;
  return Math.min(tier, lockedRefundPercent ?? 100) as 0 | 50 | 100;
}
