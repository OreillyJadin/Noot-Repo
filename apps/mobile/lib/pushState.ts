// Where this phone stands on notification permission — the decision only, so it can be
// tested without the native module (test/pushState.test.ts). lib/push.ts feeds it.
export type PushState =
  /** Allowed: notifications reach the phone. */
  | 'on'
  /** Never asked: the system prompt can still be shown. */
  | 'ask'
  /** Refused (or switched off since): only the Settings app can turn it back on. */
  | 'blocked'
  /** This build has no notification support (an older binary, or a simulator quirk). */
  | 'unavailable';

export interface PermissionReading {
  granted: boolean;
  canAskAgain: boolean;
  /** iOS "deliver quietly" — notifications arrive, so it counts as on. */
  provisional?: boolean;
}

export function pushStateOf(p: PermissionReading | null): PushState {
  if (!p) return 'unavailable';
  if (p.granted || p.provisional) return 'on';
  return p.canAskAgain ? 'ask' : 'blocked';
}
