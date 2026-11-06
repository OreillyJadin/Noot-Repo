import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api, extensionQuoteFor, type Booking, type BookingExtension } from '@noot/core';
import { Button, Card, useTheme } from '@noot/ui';
import { confirmAction } from './confirm';

type ExtensionState = BookingExtension;

function latestExtension(booking: Booking): ExtensionState | null {
  const extensions = booking.extensions ?? [];
  return extensions.length ? extensions[extensions.length - 1]! : null;
}

function money(value: number) {
  return `$${value.toFixed(2).replace(/\.00$/, '')}`;
}

export function SessionExtensionPanel({
  booking,
  role,
  counterpartName,
  now,
  onUpdated,
}: {
  booking: Booking;
  role: 'student' | 'tutor';
  counterpartName: string;
  now: number;
  onUpdated?: () => void;
}) {
  const t = useTheme();
  const [extension, setExtension] = useState<ExtensionState | null>(() => latestExtension(booking));
  const [clock, setClock] = useState(now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setExtension(latestExtension(booking));
  }, [booking.id, booking.extensions]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Math.max(now, Date.now())), 5_000);
    return () => clearInterval(timer);
  }, [now]);

  useEffect(() => {
    if (!extension || extension.status !== 'pending') return;
    const poll = async () => {
      const latest = await api.bookings.get(booking.id).catch(() => null);
      if (!latest) return;
      const current = latestExtension(latest);
      if (current) setExtension(current);
      onUpdated?.();
    };
    const timer = setInterval(() => { void poll(); }, 10_000);
    return () => clearInterval(timer);
  }, [booking.id, extension?.id, extension?.status, onUpdated]);

  const active = extension && ['pending', 'confirmed', 'completed'].includes(extension.status);
  const end = new Date(booking.scheduledAt).getTime() + booking.durationMinutes * 60_000;
  const inRequestWindow = booking.status === 'confirmed' &&
    clock >= end - 10 * 60_000 && clock < end &&
    !booking.noShowClaimedAt && !booking.completionClaimedAt && booking.disputeStatus !== 'flagged';

  const request = (minutes: 30 | 60) => {
    const quote = extensionQuoteFor(booking.price, booking.durationMinutes, minutes);
    confirmAction({
      title: `Add ${minutes === 60 ? '1 hour' : '30 minutes'}?`,
      message: `Add ${minutes} minutes for ${money(quote.total)}${quote.total > 0 ? ' on your card' : ''}?`,
      confirmText: 'Add time',
      onConfirm: () => {
        setBusy(true);
        setError('');
        void api.requestExtension(booking.id, minutes).then((result) => {
          setExtension({
            id: result.bookingId,
            extendsBookingId: booking.id,
            status: 'pending',
            durationMinutes: result.minutes,
            price: result.price,
            studentFee: result.studentFee,
            tutorPayoutAmount: 0,
            acceptBy: result.acceptBy,
            acceptedAt: null,
            cancelReason: null,
          });
          onUpdated?.();
        }).catch((reason) => {
          setError(reason instanceof Error ? reason.message : 'Could not request more time.');
        }).finally(() => setBusy(false));
      },
    });
  };

  const respond = (accept: boolean) => {
    if (!extension || busy) return;
    setBusy(true);
    setError('');
    void api.respondExtension(extension.id, accept).then(() => {
      setExtension({
        ...extension,
        status: accept ? 'confirmed' : 'cancelled',
        acceptedAt: accept ? new Date().toISOString() : null,
        cancelReason: accept ? null : 'tutor_declined',
      });
      onUpdated?.();
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Could not update the extension request.');
    }).finally(() => setBusy(false));
  };

  if (active && extension) {
    const minutes = extension.durationMinutes;
    const total = extension.price + extension.studentFee;
    const expired = extension.status === 'pending' && !!extension.acceptBy &&
      clock >= new Date(extension.acceptBy).getTime() && booking.disputeStatus !== 'flagged';
    return (
      <Card style={{ marginTop: 12, padding: 14 }}>
        {extension.status === 'confirmed' || extension.status === 'completed' ? (
          <>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>+{minutes} min added</Text>
            <Text style={{ color: t.text2, fontSize: 12, marginTop: 3 }}>
              Extension amount {money(total)}
            </Text>
          </>
        ) : booking.disputeStatus === 'flagged' ? (
          <Text style={{ color: t.text2, fontSize: 13 }}>Extra time is waiting for the noot team&apos;s review.</Text>
        ) : expired || extension.cancelReason === 'tutor_no_response' ? (
          <Text style={{ color: t.text2, fontSize: 13 }}>Extra-time request expired.</Text>
        ) : extension.status === 'cancelled' ? (
          <Text style={{ color: t.text2, fontSize: 13 }}>
            {extension.cancelReason === 'tutor_declined' ? 'Your tutor declined the extra-time request.' : 'Extra-time request cancelled.'}
          </Text>
        ) : role === 'student' ? (
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>Waiting for {counterpartName}…</Text>
        ) : (
          <>
            <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>
              Student wants +{minutes} min. Accept within 5 minutes.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Button label={busy ? 'Please wait…' : 'Accept'} kind="primary" size="sm" disabled={busy}
                style={{ flex: 1 }} onPress={() => respond(true)} />
              <Button label="Decline" kind="secondary" size="sm" disabled={busy}
                style={{ flex: 1 }} onPress={() => respond(false)} />
            </View>
          </>
        )}
        {error ? <Text style={{ color: t.danger, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
      </Card>
    );
  }

  if (role !== 'student' || !inRequestWindow) return null;
  const quote30 = extensionQuoteFor(booking.price, booking.durationMinutes, 30);
  const quote60 = extensionQuoteFor(booking.price, booking.durationMinutes, 60);
  return (
    <Card style={{ marginTop: 12, padding: 14 }}>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>Add time</Text>
      <Text style={{ color: t.text2, fontSize: 12, marginTop: 3 }}>
        Your tutor must accept. {quote30.total > 0 ? 'The same card will be charged.' : 'There will be no charge.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Button label={`+30 min · ${money(quote30.total)}`} kind="tint" size="sm" disabled={busy}
          style={{ flex: 1 }} onPress={() => request(30)} />
        <Button label={`+1 hour · ${money(quote60.total)}`} kind="tint" size="sm" disabled={busy}
          style={{ flex: 1 }} onPress={() => request(60)} />
      </View>
      {busy ? <Text style={{ color: t.text3, fontSize: 12, marginTop: 8 }}>Sending request…</Text> : null}
      {error ? <Text style={{ color: t.danger, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
    </Card>
  );
}
