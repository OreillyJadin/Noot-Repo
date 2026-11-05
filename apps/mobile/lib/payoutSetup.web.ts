// Web: Stripe's hosted payout onboarding opens in a new tab. The tab is opened inside the
// click, before the network call (browsers block a tab opened after an await), and setup
// counts as closed once the tutor comes back to this tab, so callers refresh the status
// then. Stripe ends on connect-return's "you can close this tab" page (returnTo: 'web').
// Same exports as lib/payoutSetup.ts.
import { Alert } from 'react-native';
import { api } from '@noot/core';
import { errText } from './errText';

export type InAppOutcome = 'closed' | 'failed';

/** No in-app form on web (lib/PayoutSetupHost.web.tsx registers nothing). */
export function registerPayoutSetupHost(_next: unknown): void {}

let inFlight: Promise<boolean> | null = null;

/** Opens payout setup and resolves once the tutor is back on this tab. False if it couldn't open. */
export function openPayoutSetup(): Promise<boolean> {
  inFlight ??= run().finally(() => { inFlight = null; });
  return inFlight;
}

function backOnThisTab(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      if (document.visibilityState !== 'visible') return;
      window.removeEventListener('focus', done);
      document.removeEventListener('visibilitychange', done);
      resolve();
    };
    window.addEventListener('focus', done);
    document.addEventListener('visibilitychange', done);
  });
}

async function run(): Promise<boolean> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await api.connect.onboardingLink({ returnTo: 'web' });
    if (!url) {
      tab?.close();
      Alert.alert(
        'Payout setup unavailable',
        'We could not start Stripe payout setup just now. Please try again in a few minutes.',
      );
      return false;
    }
    if (!tab) {
      window.location.assign(url);
      return true;
    }
    tab.opener = null;
    tab.location.href = url;
    await backOnThisTab();
    return true;
  } catch (e) {
    tab?.close();
    Alert.alert('Could not open payout setup', errText(e, 'Please try again.'));
    return false;
  }
}
