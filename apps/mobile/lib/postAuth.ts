// What to do once a session exists, regardless of HOW it was established
// (magic-link callback, email+password, or biometric unlock). Keeping this in one
// place means every auth path lands users in the same spot: onboarded users go to
// their role's home, brand-new users start the onboarding flow.
import type { Router } from 'expo-router';
import { api } from '@noot/core';
import type { Role } from './store';

export interface RouteAfterAuthResult {
  /** The role we routed as (student unless the user's active role is tutor). */
  role: Role;
  /** True if we sent them into onboarding (no profile yet) rather than a home. */
  onboarding: boolean;
}

/**
 * Read the signed-in user and navigate. Onboarded users (they have a first name)
 * land on their role's home; everyone else starts onboarding at /verified. Any
 * lookup failure falls back to onboarding, which is the safe default for a fresh
 * account. Uses router.replace so auth screens don't linger in the back stack.
 */
export async function routeAfterAuth(router: Router, setRole: (r: Role) => void): Promise<RouteAfterAuthResult> {
  try {
    const me = await api.getMe();
    if (me && me.firstName.trim()) {
      // core's Role also has 'ambassador' (no dedicated home yet) — land it as student.
      const isTutor = me.activeRole === 'tutor';
      const role: Role = isTutor ? 'tutor' : 'student';
      setRole(role);
      router.replace(isTutor ? '/tutor_home' : '/home');
      return { role, onboarding: false };
    }
  } catch {
    /* fall through to onboarding */
  }
  router.replace('/verified');
  return { role: 'student', onboarding: true };
}
