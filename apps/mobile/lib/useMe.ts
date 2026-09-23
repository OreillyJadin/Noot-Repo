// Current signed-in user + what they're allowed to do. The single read-path for "who am I".
//
// This used to be a bare hook that ran its own api.getMe() on mount. It's called from 22
// screens, and tab roots remount on every navigation, so that meant 22 uncoordinated round
// trips, each screen holding a snapshot from its own mount, and two mounted screens able to
// disagree about your roles. It's now backed by one provider: a single fetch, shared, with an
// explicit refresh() for after something changes your standing.
//
// KEPT CURRENT without any screen having to ask (tracker S1 — signup data and a new photo
// only appeared after a force-quit, because this loaded once at launch and nothing ever
// called refresh()). It re-reads when:
//   • a profile write succeeds anywhere (@noot/core's onUserChanged),
//   • someone signs in or out, or the account is updated (auth.onAuthChange) — sign-out
//     also clears the previous user's app state,
//   • the app returns to the foreground, which picks up changes made elsewhere
//     (an admin approving you, finishing Stripe onboarding in the browser).
//
// TWO AXES, deliberately kept apart:
//   • capabilities here (user_roles + tutor approval) = what you MAY do. Server-enforced;
//     this is only a mirror for rendering.
//   • useApp().role / users.active_role = which UI you're LOOKING at. Cosmetic (see 0007).
//     No permission decision should ever read it.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, auth, onUserChanged } from '@noot/core';
import type { User } from '@noot/core';
import { useApp } from './store';

/**
 * Where the user stands as a tutor. Branch on THIS, not on roles.includes('tutor') — the
 * tutor role only exists after an admin approves, so a role check can't tell "never applied"
 * from "application in review", and it reads false for the entire review period.
 */
export type TutorStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface MeState {
  me: User | null;
  loading: boolean;
  /** Re-read the user + tutor status (e.g. after applying, or returning from approval). */
  refresh: () => Promise<void>;
  tutorStatus: TutorStatus;
  /** Approved tutor — may actually take bookings. */
  isTutor: boolean;
  isAmbassador: boolean;
  isAdmin: boolean;
}

const EMPTY: MeState = {
  me: null,
  loading: true,
  refresh: async () => {},
  tutorStatus: 'none',
  isTutor: false,
  isAmbassador: false,
  isAdmin: false,
};

const MeContext = createContext<MeState | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  // Via a ref: the store rebuilds `reset` on every change, and depending on it directly would
  // tear down and re-subscribe everything below each time a booking draft is edited.
  const { reset } = useApp();
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const [me, setMe] = useState<User | null>(null);
  const [tutorStatus, setTutorStatus] = useState<TutorStatus>('none');
  const [loading, setLoading] = useState(true);
  // Loads can overlap (a save and a foreground land together). Only the newest one may
  // write, or a slow earlier read would put stale data back over a fresh one.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    // Both reads together — a screen must never see the user without their standing, or it
    // renders "not a tutor" for a frame and flashes the wrong banner.
    const [user, status] = await Promise.all([
      api.getMe().catch(() => null),
      api.profile.getTutorStatus().catch((): TutorStatus => 'none'),
    ]);
    if (mine !== seq.current) return;
    setMe(user);
    setTutorStatus(status);
  }, []);

  useEffect(() => {
    let active = true;
    void load().finally(() => { if (active) setLoading(false); });
    const offUser = onUserChanged(() => { void load(); });
    const offAuth = auth.onAuthChange((change) => {
      if (change === 'signed_out') {
        seq.current++; // drop any read still in flight for the old user
        setMe(null);
        setTutorStatus('none');
        resetRef.current();
        return;
      }
      // Deferred: supabase-js holds its auth lock while this callback runs, and a query
      // issued inside it waits on that same lock.
      setTimeout(() => { void load(); }, 0);
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    return () => {
      active = false;
      offUser();
      offAuth();
      appState.remove();
    };
  }, [load]);

  const value = useMemo<MeState>(() => {
    const roles = me?.roles ?? [];
    return {
      me,
      loading,
      refresh: load,
      tutorStatus,
      isTutor: tutorStatus === 'approved',
      isAmbassador: roles.includes('ambassador'),
      isAdmin: roles.includes('admin'),
    };
  }, [me, loading, tutorStatus, load]);

  return React.createElement(MeContext.Provider, { value }, children);
}

/**
 * The signed-in user and their capabilities. Falls back to a null user outside the provider
 * rather than throwing, so a screen rendered in isolation degrades instead of crashing.
 */
export function useMe(): MeState {
  return useContext(MeContext) ?? EMPTY;
}

/** "First Last" from a user (or a fallback when not loaded yet). */
export function fullName(u: User | null, fallback = ''): string {
  if (!u) return fallback;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || fallback;
}

/** Just the first name (or fallback) — for greetings like "Hey, Sara". */
export function firstName(u: User | null, fallback = ''): string {
  return u?.firstName || fallback;
}
