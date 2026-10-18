// Leave the signed-in app for the landing with an empty back stack. router.replace('/') alone
// only swaps the top screen, so after "Details" → Sessions → Profile → Sign out, Android Back
// went to the previous account's cached Home (STU-07). dismissAll pops the stack to its first
// screen, which the replace then swaps for the landing.
import type { ImperativeRouter } from 'expo-router';

export function resetToSignedOut(router: ImperativeRouter): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}
