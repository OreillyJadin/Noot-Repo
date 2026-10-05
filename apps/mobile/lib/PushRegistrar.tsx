// Keeps this device registered for the signed-in account's notifications, and opens the
// notification center when one is tapped (ERR-031). Renders nothing. Mounted once, inside
// the navigator's providers (app/_layout.tsx).
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { auth } from '@noot/core';
import { onPushTap, registerThisDevice } from './push';

export function PushRegistrar() {
  const router = useRouter();
  useEffect(() => {
    // A returning launch with a live session, and every later sign-in. Both are no-ops
    // until the user has allowed notifications (the prompt is on the Notifications screen).
    void registerThisDevice();
    const offAuth = auth.onAuthChange((change) => {
      if (change === 'signed_in') void registerThisDevice();
    });
    const offTap = onPushTap(() => {
      void auth.getSessionUserId().then((uid) => { if (uid) router.push('/notifications'); });
    });
    return () => { offAuth(); offTap(); };
  }, [router]);
  return null;
}
