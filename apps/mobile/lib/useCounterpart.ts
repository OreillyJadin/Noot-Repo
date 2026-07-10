// Resolves the tutor-side counterpart (the session's student) to a REAL name/year/major
// via the resolve-participants edge function — replacing the old hardcoded "Lindsay
// Thomas" demo value. The booking draft doesn't carry a studentId yet, so when none is
// given we fall back to the caller's first booking counterparty (correct in the common
// single-counterpart case); until anything loads it reads "Your student".
import { useEffect, useState } from 'react';
import { api } from '@noot/core';

export interface Counterpart {
  name: string;
  first: string;
  year: string | null;
  major: string | null;
}

const FALLBACK: Counterpart = { name: 'Your student', first: 'Your student', year: null, major: null };

export function useCounterpart(preferId?: string): Counterpart {
  const [c, setC] = useState<Counterpart>(FALLBACK);
  useEffect(() => {
    let active = true;
    api
      .resolveParticipantNames()
      .then((map) => {
        if (!active) return;
        const picked = (preferId && map[preferId]) || Object.values(map)[0];
        if (!picked) return;
        const name = `${picked.firstName} ${picked.lastName}`.trim() || 'Your student';
        setC({ name, first: picked.firstName || name, year: picked.year, major: picked.major });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [preferId]);
  return c;
}
