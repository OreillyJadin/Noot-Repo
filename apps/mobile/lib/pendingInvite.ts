// The friend's invite code typed on the sign-up screen, kept on the device until the new
// account signs in (via the emailed link or code) and can claim it as itself (api.credits.claim).
// Not sent with the sign-up request: anyone can request a link for any address, so a code
// riding with it can't be trusted to be the address owner's (0040). The decisions live in
// inviteClaim.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@noot/core';
import { isFinalRefusal, makePending, parsePending, pendingAction } from './inviteClaim';

const KEY = 'noot.pendingInvite';

export async function savePendingInvite(code: string, email: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(makePending(code, email, Date.now()))); } catch { /* best effort */ }
}

/**
 * Claim a saved code if it was typed for the account that's now signed in. Fire-and-forget
 * (`void claimPendingInvite()`): it never throws and must never hold up sign-in. The code is
 * forgotten once applied or refused for good; anything else keeps it for the next sign-in.
 */
export async function claimPendingInvite(): Promise<void> {
  try {
    const pending = parsePending(await AsyncStorage.getItem(KEY));
    if (!pending) return;
    const me = await api.getMe();
    if (!me?.email) return;
    const action = pendingAction(pending, me.email, Date.now());
    if (action === 'keep') return;
    if (action === 'claim') {
      try {
        await api.credits.claim(pending.code);
      } catch (e) {
        if (!isFinalRefusal(e)) return;
      }
    }
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* best effort — retried at the next sign-in */
  }
}
