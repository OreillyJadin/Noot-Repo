// Web stand-in for @stripe/stripe-react-native, aliased in metro.config.js for web only.
// The native SDK deep-imports react-native internals that react-native-web doesn't have,
// which is what broke the web bundle. Card payments on web arrive with Stripe.js; until
// then the payment sheet reports that it isn't available here.
import React from 'react';

const unavailable = { code: 'Failed', message: 'Card payments are not available on the web yet. Use the noot app to pay.' };

export function StripeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useStripe() {
  return {
    initPaymentSheet: async (_params: unknown) => ({ error: unavailable }),
    presentPaymentSheet: async () => ({ error: unavailable }),
    isPlatformPaySupported: async () => false,
  };
}

// Payout onboarding (ConnectAccountOnboarding & co.) is deliberately absent: web has its
// own lib/PayoutSetupHost.web.tsx, which registers no host, so openPayoutSetup() falls back
// to Stripe's hosted page instead of waiting on a component that can never exit.
