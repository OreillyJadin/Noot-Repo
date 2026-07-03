// Shared helpers for the kit. Theme radii come as CSS px strings ("14px", "999px");
// React Native needs numbers.
export function parseRadius(px: string, fallback = 12): number {
  const n = parseInt(px, 10);
  return Number.isFinite(n) ? Math.min(n, 999) : fallback;
}
