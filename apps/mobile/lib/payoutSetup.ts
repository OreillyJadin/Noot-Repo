// Open Stripe Connect's hosted onboarding (tutor payouts). Shared by onboarding step 8 and
// the tutor profile's Payouts row. Callers must guard against double taps: a second tap
// while the Edge Function cold-starts used to create a second Stripe account (T24).
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@noot/core';
import { errText } from './errText';

/** Opens onboarding and resolves once the browser closes. False if it couldn't open. */
export async function openPayoutSetup(): Promise<boolean> {
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
