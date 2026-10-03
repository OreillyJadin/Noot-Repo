// The friend's invite code typed on the sign-up screen, kept on the device until the new
// account signs in (via the emailed link) and can claim it as itself (api.credits.claim).
// Not sent with the sign-up request: anyone can request a link for any address, so a code
// riding with it can't be trusted to be the address owner's (0040).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@noot/core';

const KEY = 'noot.pendingInviteCode';

export async function savePendingInvite(code: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, code.trim()); } catch { /* best effort */ }
}

/**
 * Claim a saved code, if any. Called after every sign-in; a no-op when nothing is saved.
 * The code is forgotten once the server has answered (applied, or refused for good); a
 * network failure keeps it for the next sign-in.
 */
export async function claimPendingInvite(): Promise<void> {
  let code: string | null = null;
  try { code = await AsyncStorage.getItem(KEY); } catch { return; }
  if (!code) return;
  try {
    await api.credits.claim(code);
  } catch (e) {
    // A Postgres-raised refusal carries a code; a network/transport failure doesn't.
    if (!(e as { code?: string })?.code) return;
  }
  try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
}
