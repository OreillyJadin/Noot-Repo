// Unread-notification count for the bell badge. Fetches once on mount (and whenever the
// caller bumps `deps`, e.g. a screen-focus tick). Silent on failure → 0.
import { useEffect, useState } from 'react';
import { api } from '@noot/core';

export function useUnread(deps: unknown[] = []): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    api.notifications.unreadCount().then((c) => { if (active) setCount(c); }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return count;
}
