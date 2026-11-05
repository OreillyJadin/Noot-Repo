import React, { useCallback, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { api, type Booking } from '@noot/core';
import { Button, useTheme } from '@noot/ui';
import { useSessionClock } from './useSessionClock';
import { videoJoinState } from './videoSession';

export function JoinVideoButton({ bookingId }: { bookingId: string }) {
  const t = useTheme();
  const now = useSessionClock();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const b = await api.bookings.get(bookingId);
    setBooking(b);
    setLoadFailed(!b);
  }, [bookingId]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setBooking(null);
    setLoadFailed(false);
    const refresh = () => api.bookings.get(bookingId).then((b) => {
      if (active) { setBooking(b); setLoadFailed(!b); }
    }).catch(() => { if (active) setLoadFailed(true); });
    void refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [bookingId]));
  const state = videoJoinState(booking, now);
  const join = async () => {
    setBusy(true);
    try {
      if (loadFailed) { await load(); return; }
      const { url } = await api.bookings.joinVideo(bookingId);
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      Alert.alert('Video session', error instanceof Error ? error.message : 'Unable to open your video session. Please try again.');
    } finally { setBusy(false); }
  };
  const shareComputerLink = async () => {
    setBusy(true);
    try {
      const { url } = await api.bookings.joinVideo(bookingId, { device: 'computer' });
      await Share.share({ message: url });
    } catch (error) {
      Alert.alert('Video session', error instanceof Error ? error.message : 'Unable to open your video session. Please try again.');
    } finally { setBusy(false); }
  };
  const confirmComputerShare = () => Alert.alert(
    'Share your screen from a computer',
    "Phones can't share their screen in Noot video. Send this private link to your own computer (AirDrop, Notes or email yourself) and open it there to share your screen. Don't forward it — it's only for you, and it expires when the session ends.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: () => { void shareComputerLink(); } },
    ],
  );
  return (
    <View style={{ gap: 6, marginTop: 12 }}>
      <Button label={busy ? 'Opening…' : loadFailed ? 'Retry video details' : state.label}
        full kind="secondary" size="sm" disabled={busy || (!loadFailed && !state.enabled)} onPress={join} />
      {state.enabled && booking?.dailyRoomName ? (
        <View style={{ alignItems: 'flex-start', gap: 2 }}>
          <Text style={{ color: t.text3, fontSize: 12 }}>Meeting code: {booking.dailyRoomName.toUpperCase()}</Text>
          <Button
            label="Share your screen from a computer"
            kind="ghost"
            size="sm"
            disabled={busy}
            style={{ minHeight: 28, paddingHorizontal: 0 }}
            onPress={confirmComputerShare}
          />
        </View>
      ) : null}
    </View>
  );
}
