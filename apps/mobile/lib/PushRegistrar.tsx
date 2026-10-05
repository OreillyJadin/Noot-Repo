// Keeps this device registered for the signed-in account's notifications (ERR-031). Renders
// nothing. Mounted once, inside the app's providers (app/_layout.tsx).
//
// Tapping a notification just opens the app where it was: nothing navigates. Jumping to the
// notification center from here would run before the app lock and the launch routing have
// finished, and that screen marks everything read as it opens.
import { useEffect } from 'react';
import { auth } from '@noot/core';
import { registerThisDevice } from './push';

export function PushRegistrar() {
  useEffect(() => {
    // A returning launch with a live session, and every later sign-in. Both are no-ops
    // until the user has allowed notifications (the prompt is on the Notifications screen).
    void registerThisDevice();
    return auth.onAuthChange((change) => {
      if (change === 'signed_in') void registerThisDevice();
    });
  }, []);
  return null;
}
