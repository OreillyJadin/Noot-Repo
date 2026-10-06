// Open Stripe payout setup (tutor payouts). Shared by onboarding step 8 and the tutor
// profile's Payouts row. Callers must guard against double taps: a second tap while the
// Edge Function cold-starts used to create a second Stripe account (T24).
//
// Two ways in (ERR-018). The preferred one shows Stripe's onboarding form INSIDE the app
// (lib/PayoutSetupHost). The other opens Stripe's hosted page in the in-app browser, which
// is what every build up to 9 does. The hosted page is the fallback whenever the in-app
// form can't be used: Expo Go (no native Stripe module, so no host is mounted), a server
// with no Stripe key or without session support, or a form that fails to load.
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@noot/core';
import { errText } from './errText';

/**
 * How an in-app attempt ended, reported once the form is off screen: the tutor closed a
 * form that loaded, or closed one that had failed to load.
 */
export type InAppOutcome = 'closed' | 'failed';
type Host = (clientSecret: string) => Promise<InAppOutcome>;

let host: Host | null = null;
/** PayoutSetupHost registers itself here while mounted. */
export function registerPayoutSetupHost(next: Host | null): void {
  host = next;
}

async function openInApp(): Promise<boolean> {
  // No key, no form: the SDK would load with an empty one and show its own error.
  if (!host || !process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) return false;
  try {
    const { clientSecret } = await api.connect.accountSession();
    if (!clientSecret) return false;
    return (await host(clientSecret)) === 'closed';
  } catch {
    // Fall back to the hosted page, which reports its own failure to the tutor.
    return false;
  }
}

// One setup at a time, whoever asks. The callers' own guards are React state, which a fast
// second tap can get past; a second form or browser on top of the first must not happen.
let inFlight: Promise<boolean> | null = null;

/** Opens payout setup and resolves once it is closed. False if it couldn't open. */
export function openPayoutSetup(): Promise<boolean> {
  inFlight ??= run().finally(() => { inFlight = null; });
  return inFlight;
}

async function run(): Promise<boolean> {
  if (await openInApp()) return true;
  try {
    const { url } = await api.connect.onboardingLink();
    if (!url) {
      Alert.alert(
        'Payout setup unavailable',
        'We could not start Stripe payout setup just now. Please try again in a few minutes.',
      );
      return false;
    }
    await WebBrowser.openAuthSessionAsync(url, 'noot://connect-return');
    return true;
  } catch (e) {
    Alert.alert('Could not open payout setup', errText(e, 'Please try again.'));
    return false;
  }
}
