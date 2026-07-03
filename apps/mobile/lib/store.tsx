// App state shared across screens (booking-in-progress + active role).
// In-memory for now; back with @noot/core + Supabase later. Mirrors the shape the
// handoff's `booking` object and `role` carried through the flow.
import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Tutor } from './data';

export type Role = 'student' | 'tutor';

/** The booking object carried B3 → B4 → B5. All optional until built up. */
export interface BookingDraft {
  tutor?: Tutor;
  course?: string;
  dayIndex?: number;
  slot?: string;
  lengthMin?: number;
  location?: string;
  tag?: string;
  message?: string;
  repeat?: 'once' | 'weekly';
}

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  booking: BookingDraft;
  setBooking: (b: BookingDraft) => void;
  /** Merge a partial update into the current booking draft. */
  patchBooking: (patch: Partial<BookingDraft>) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('student');
  const [booking, setBooking] = useState<BookingDraft>({});
  const value = useMemo<AppState>(
    () => ({
      role,
      setRole,
      booking,
      setBooking,
      patchBooking: (patch) => setBooking((b) => ({ ...b, ...patch })),
    }),
    [role, booking],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}
