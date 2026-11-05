// Web stand-in for @stripe/stripe-react-native, aliased in metro.config.js for web only.
// The native SDK deep-imports react-native internals that react-native-web doesn't have, so
// the web gets the same useStripe() PaymentSheet calls implemented with Stripe.js: the
// Payment Element in a modal. Screens (b4, PaymentUpdateBanner) call initPaymentSheet /
// presentPaymentSheet exactly as on native, against the same Edge Function client secrets.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe as useStripeJs } from '@stripe/react-stripe-js';
import { useTheme } from '@noot/ui';
import { useThemePref } from '../lib/themePref';

type SheetError = { code: 'Canceled' | 'Failed'; message: string };
type SheetResult = { error?: SheetError };
type InitParams = {
  paymentIntentClientSecret?: string;
  setupIntentClientSecret?: string;
  merchantDisplayName?: string;
  [key: string]: unknown;
};
type Sheet = { mode: 'payment' | 'setup'; clientSecret: string };

const failed = (message: string): SheetResult => ({ error: { code: 'Failed', message } });
const NOT_SET_UP = 'Card payments are not set up for the web app yet.';

interface Ctx {
  initPaymentSheet: (params: InitParams) => Promise<SheetResult>;
  presentPaymentSheet: () => Promise<SheetResult>;
  isPlatformPaySupported: (_params?: unknown) => Promise<boolean>;
}

const StripeCtx = createContext<Ctx | null>(null);

export function StripeProvider({ publishableKey, children }: { publishableKey: string; children: React.ReactNode; [key: string]: unknown }) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey).catch(() => null) : null),
    [publishableKey],
  );
  const pending = useRef<Sheet | null>(null);
  const [open, setOpen] = useState<{ sheet: Sheet; resolve: (r: SheetResult) => void } | null>(null);

  const initPaymentSheet = useCallback(async (params: InitParams) => {
    if (!stripePromise) return failed(NOT_SET_UP);
    const clientSecret = params.setupIntentClientSecret ?? params.paymentIntentClientSecret;
    if (!clientSecret) return failed('Missing payment details. Please try again.');
    pending.current = { mode: params.setupIntentClientSecret ? 'setup' : 'payment', clientSecret };
    return {};
  }, [stripePromise]);

  const presentPaymentSheet = useCallback(() => {
    const sheet = pending.current;
    if (!stripePromise || !sheet) return Promise.resolve(failed(NOT_SET_UP));
    return new Promise<SheetResult>((resolve) => setOpen({ sheet, resolve }));
  }, [stripePromise]);

  const value = useMemo<Ctx>(() => ({
    initPaymentSheet,
    presentPaymentSheet,
    isPlatformPaySupported: async () => false,
  }), [initPaymentSheet, presentPaymentSheet]);

  const finish = (result: SheetResult) => {
    open?.resolve(result);
    pending.current = null;
    setOpen(null);
  };

  return (
    <StripeCtx.Provider value={value}>
      {children}
      {open && stripePromise ? <PaymentModal stripe={stripePromise} sheet={open.sheet} onDone={finish} /> : null}
    </StripeCtx.Provider>
  );
}

export function useStripe(): Ctx {
  const ctx = useContext(StripeCtx);
  if (ctx) return ctx;
  return {
    initPaymentSheet: async () => failed(NOT_SET_UP),
    presentPaymentSheet: async () => failed(NOT_SET_UP),
    isPlatformPaySupported: async () => false,
  };
}

function PaymentModal({ stripe, sheet, onDone }: { stripe: Promise<Stripe | null>; sheet: Sheet; onDone: (r: SheetResult) => void }) {
  const t = useTheme();
  const { dark } = useThemePref();
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    stripe.then((s) => { if (active && !s) setLoadFailed(true); }, () => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [stripe]);
  const appearance: Appearance = {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: t.accent,
      colorBackground: t.surface,
      colorText: t.text,
      colorDanger: t.danger,
      borderRadius: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
  };
  const cancel = () => onDone({ error: { code: 'Canceled', message: 'Canceled' } });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Cancel payment" style={styles.backdrop} onPress={cancel} />
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.title, { color: t.text }]}>{sheet.mode === 'setup' ? 'Save a card' : 'Pay with card'}</Text>
            {loadFailed ? (
              <Text style={{ color: t.danger, fontSize: 14 }}>Stripe could not load. Check your connection and try again.</Text>
            ) : (
              <Elements stripe={stripe} options={{ clientSecret: sheet.clientSecret, appearance }}>
                <PaymentForm sheet={sheet} onDone={onDone} onCancel={cancel} />
              </Elements>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PaymentForm({ sheet, onDone, onCancel }: { sheet: Sheet; onDone: (r: SheetResult) => void; onCancel: () => void }) {
  const t = useTheme();
  const stripe = useStripeJs();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    if (!stripe || sheet.mode !== 'payment') return;
    let active = true;
    void stripe.retrievePaymentIntent(sheet.clientSecret).then(({ paymentIntent }) => {
      if (active && paymentIntent) setAmount((paymentIntent.amount / 100).toFixed(2));
    });
    return () => { active = false; };
  }, [stripe, sheet]);

  const submit = async () => {
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    // Cards confirm in place. return_url is only used by a method that must redirect.
    const confirmParams = { return_url: window.location.href };
    const result = sheet.mode === 'setup'
      ? await stripe.confirmSetup({ elements, confirmParams, redirect: 'if_required' })
      : await stripe.confirmPayment({ elements, confirmParams, redirect: 'if_required' });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Your card could not be used. Try another card.');
      return;
    }
    const status = 'setupIntent' in result ? result.setupIntent?.status : result.paymentIntent?.status;
    if (status === 'succeeded' || status === 'requires_capture' || status === 'processing') onDone({});
    else onDone(failed('Payment was not completed. Please try again.'));
  };

  const label = sheet.mode === 'setup' ? 'Save card' : amount ? `Pay $${amount}` : 'Pay';
  return (
    <View style={{ gap: 14 }}>
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={() => setError('The card form could not load. Close this and try again.')}
        options={{ layout: 'tabs' }}
      />
      {!ready && !error ? <ActivityIndicator color={t.accent} /> : null}
      {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} disabled={busy} style={styles.button}>
          <Text style={[styles.buttonText, { color: t.text2 }]}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={!ready || busy}
          style={[styles.button, styles.primary, { backgroundColor: t.accent, opacity: !ready || busy ? 0.6 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: t.onAccent }]}>{busy ? 'Processing…' : label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  card: { width: '100%', maxWidth: 480, maxHeight: '90%', borderRadius: 18, overflow: 'hidden' },
  body: { padding: 22, gap: 16 },
  title: { fontSize: 19, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  primary: { minWidth: 140, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
});

// Payout onboarding (ConnectAccountOnboarding & co.) is deliberately absent: web has its
// own lib/PayoutSetupHost.web.tsx, which registers no host, so openPayoutSetup() falls back
// to Stripe's hosted page instead of waiting on a component that can never exit.
