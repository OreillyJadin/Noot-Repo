import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { api, type Booking } from '@noot/core';
import { Button, Ic, useTheme } from '@noot/ui';
import { errText } from './errText';
import { canUpdatePayment, needsPaymentUpdate } from './paymentTiming';

export function PaymentUpdateBanner({ booking, onUpdated, now }: { booking: Booking; onUpdated: () => void; now: number }) {
  const t = useTheme();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);
  if (!needsPaymentUpdate(booking)) return null;
  const notDue = !!booking.holdDueAt && Date.parse(booking.holdDueAt) > now;
  const canUpdate = canUpdatePayment(booking.scheduledAt, now) && !notDue;

  async function update() {
    if (busy) return;
    setBusy(true);
    try {
      const payment = await api.bookings.createPaymentUpdate(booking.id);
      if (!payment.simulated) {
        if (Constants.appOwnership === 'expo') {
          Alert.alert('Use the Noot dev build', 'Open the dev or TestFlight build to update your card.');
          return;
        }
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Noot',
          paymentIntentClientSecret: payment.paymentIntentClientSecret!,
          returnURL: 'noot://stripe-redirect',
          applePay: { merchantCountryCode: 'US' },
          googlePay: { merchantCountryCode: 'US', currencyCode: 'USD', testEnv: __DEV__ },
        });
        if (initError) throw new Error(initError.message);
        const { error } = await presentPaymentSheet();
        if (error?.code === 'Canceled') return;
        if (error) throw new Error(error.message);
      }
      await api.bookings.attachPaymentUpdate(booking.id, payment.paymentIntentId);
      onUpdated();
      Alert.alert('Payment updated', 'Your card is confirmed for this session.');
    } catch (e) {
      Alert.alert('Could not update payment', errText(e, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: t.accentWeak, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Ic name="alert" size={18} color={t.accent} />
        <Text style={{ flex: 1, color: t.text, fontSize: 13, lineHeight: 19 }}>
          {notDue
            ? "We couldn't confirm your card. You can update payment starting 2 days before this session."
            : canUpdate
            ? "We couldn't confirm your card. Update payment before 12 hours before the session to keep it. Otherwise, it will be cancelled and your Noot credit returned."
            : "We couldn't confirm your card in time. This session will be cancelled and your Noot credit returned."}
        </Text>
      </View>
      {canUpdate ? <Button label={busy ? 'Updating payment…' : 'Update payment'} kind="tint" size="sm" full onPress={update} disabled={busy} /> : null}
    </View>
  );
}
