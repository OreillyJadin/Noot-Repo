// Keeps signed-in screens closed when there's no session. Two triggers:
// - the session ends (Sign out, Delete account, or supabase-js dropping a session the server
//   refused to refresh, e.g. a banned or deleted account): clear the back stack to the landing;
// - a signed-in screen comes into view without a session (a deep link or push opened while
//   signed out): send it to the landing.
// Which screens are public is lib/signedOutRoutes.ts.
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { auth } from '@noot/core';
import { isSignedOutRoute, needsSignedOutRedirect } from './signedOutRoutes';
import { resetToSignedOut } from './resetToSignedOut';

export function SignedOutGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  useEffect(() => {
    return auth.onAuthChange((change) => {
      if (change !== 'signed_out') return;
      // Already on the landing with nothing behind it: nothing to clear.
      if (isSignedOutRoute(pathRef.current) && !router.canDismiss()) return;
      resetToSignedOut(router);
    });
  }, [router]);

  useEffect(() => {
    if (isSignedOutRoute(pathname)) return;
    let live = true;
    void auth.getSessionUserId().then((userId) => {
      if (live && pathRef.current === pathname && needsSignedOutRedirect(pathname, userId != null)) {
        resetToSignedOut(router);
      }
    });
    return () => { live = false; };
  }, [pathname, router]);

  return null;
}
