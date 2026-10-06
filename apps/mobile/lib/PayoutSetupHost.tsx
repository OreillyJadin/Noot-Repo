// Stripe's payout onboarding form, shown inside the app (ERR-018) instead of on Stripe's
// hosted page. Mounted once at the root, and only in a real build: it needs the native
// Stripe module, which Expo Go doesn't have. openPayoutSetup() (lib/payoutSetup) drives it
// and falls back to the hosted page when this isn't mounted or the form fails to load.
//
// What stays Stripe's: the form's contents and, because tutor accounts are Express, a
// one-time Stripe sign-in the SDK opens before the form loads. Stripe decides what it asks
// for, so new requirements appear here without an app update.
import React, { useEffect, useRef, useState } from 'react';
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from '@stripe/stripe-react-native';
import { useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { registerPayoutSetupHost, type InAppOutcome } from './payoutSetup';

interface Open {
  instance: StripeConnectInstance;
  resolve: (outcome: InAppOutcome) => void;
}

export function PayoutSetupHost() {
  const t = useTheme();
  const theme = useRef(t);
  theme.current = t;
  const [open, setOpen] = useState<Open | null>(null);
  const current = useRef<Open | null>(null);

  useEffect(() => {
    registerPayoutSetupHost(
      (clientSecret) =>
        new Promise<InAppOutcome>((resolve) => {
          // One form at a time; a second request while one is up reports as not opened.
          if (current.current) { resolve('failed'); return; }
          // The secret the caller already fetched serves the first request. Stripe asks
          // again when a session expires mid-form, and that one is fetched fresh.
          let first: string | null = clientSecret;
          const instance = loadConnectAndInitialize({
            publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
            fetchClientSecret: async () => {
              if (first) { const secret = first; first = null; return secret; }
              const next = await api.connect.accountSession();
              if (!next.clientSecret) throw new Error('No payout setup session.');
              return next.clientSecret;
            },
            appearance: {
              variables: {
                colorPrimary: theme.current.accent,
                colorBackground: theme.current.bg,
                colorText: theme.current.text,
              },
            },
          });
          current.current = { instance, resolve };
          setOpen(current.current);
        }),
    );
    return () => {
      registerPayoutSetupHost(null);
      // Never leave a caller waiting on a form that is gone.
      current.current?.resolve('failed');
      current.current = null;
    };
  }, []);

  if (!open) return null;
  const finish = (outcome: InAppOutcome) => {
    if (current.current !== open) return;
    current.current = null;
    setOpen(null);
    open.resolve(outcome);
  };
  return (
    <ConnectComponentsProvider connectInstance={open.instance}>
      <ConnectAccountOnboarding
        title="Payout setup"
        onExit={() => finish('closed')}
        onLoadError={() => finish('failed')}
      />
    </ConnectComponentsProvider>
  );
}
