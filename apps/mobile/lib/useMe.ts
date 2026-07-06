// Current signed-in user, loaded once from @noot/core. The single read-path for
// "who am I" — screens use this instead of hardcoding names/emails. Returns null
// until loaded (or if there's no session).
import { useEffect, useState } from 'react';
import { api } from '@noot/core';
import type { User } from '@noot/core';

export function useMe(): { me: User | null; loading: boolean } {
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .getMe()
      .then((u) => {
        if (active) setMe(u);
      })
      .catch(() => {
        /* no session / offline → keep null, screens fall back */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return { me, loading };
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
