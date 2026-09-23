// App state shared across screens (booking-in-progress + active role).
// In-memory for now; back with @noot/core + Supabase later. Mirrors the shape the
// handoff's `booking` object and `role` carried through the flow.
import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Tutor } from './data';

// The three switchable "modes" a user can act as. Admin is deliberately NOT here —
// it's a Noot-team permission (me.roles.includes('admin')) surfaced as its own gated
// entry point, never a mode toggled in the role switcher.
export type Role = 'student' | 'tutor' | 'ambassador';

/** The booking object carried B3 → B4 → B5. All optional until built up. */
export interface BookingDraft {
  tutor?: Tutor;
  /** Set once a real booking exists (confirm-booking, or an item from listUpcoming) —
   *  the completion (C*) and change (X*) flows act on this id. */
  bookingId?: string;
  /** The session's student (tutor-side screens resolve their name via resolve-participants).
   *  Optional — when absent, useCounterpart falls back to the first booking counterparty. */
  studentId?: string;
  course?: string;
  /** ISO time of the real booking. Drives the live cancellation refund tier. */
  scheduledAt?: string;
  dayIndex?: number;
  slot?: string;
  lengthMin?: number;
  location?: string;
  /** Set explicitly by B3 — B4 must not re-infer it from the location label. */
  sessionType?: 'video' | 'in_person';
  tag?: string;
  message?: string;
}

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  booking: BookingDraft;
  setBooking: (b: BookingDraft) => void;
  /** Merge a partial update into the current booking draft. */
  patchBooking: (patch: Partial<BookingDraft>) => void;
  /** The last tab-root route the user was on in each mode. Lets a mode switch restore
   *  the user's place in the target mode instead of dumping them on its cold home. */
  lastRouteByRole: Partial<Record<Role, string>>;
  /** Remember `route` as the current tab for `role` (called by tab-root screens). */
  recordRoute: (role: Role, route: string) => void;
  /** Forget everything about the current user (called on sign-out), so the next account
   *  to sign in on this device never inherits their mode, place or booking draft. */
  reset: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('student');
  const [booking, setBooking] = useState<BookingDraft>({});
  const [lastRouteByRole, setLastRouteByRole] = useState<Partial<Record<Role, string>>>({});
  const value = useMemo<AppState>(
    () => ({
      role,
      setRole,
      booking,
      setBooking,
      patchBooking: (patch) => setBooking((b) => ({ ...b, ...patch })),
      lastRouteByRole,
      recordRoute: (r, route) =>
        setLastRouteByRole((m) => (m[r] === route ? m : { ...m, [r]: route })),
      reset: () => {
        setRole('student');
        setBooking({});
        setLastRouteByRole({});
      },
    }),
    [role, booking, lastRouteByRole],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}
