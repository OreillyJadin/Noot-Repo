// Web: the call opens in a new browser tab (Daily Prebuilt), where a laptop can share its
// screen itself, so the phone's "share from a computer" link isn't offered. Same props as
// lib/JoinVideoButton.tsx.
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
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
    if (loadFailed) {
      setBusy(true);
      try { await load(); } catch { /* the button stays on retry */ } finally { setBusy(false); }
      return;
    }
    // Open the tab inside the click, before the network call: browsers block a tab opened
    // after an await as an unrequested popup.
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const { url } = await api.bookings.joinVideo(bookingId);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (error) {
      tab?.close();
      Alert.alert('Video session', error instanceof Error ? error.message : 'Unable to open your video session. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6, marginTop: 12 }}>
      <Button label={busy ? 'Opening…' : loadFailed ? 'Retry video details' : state.label}
        full kind="secondary" size="sm" disabled={busy || (!loadFailed && !state.enabled)} onPress={join} />
      {state.enabled && booking?.dailyRoomName ? (
        <Text style={{ color: t.text3, fontSize: 12 }}>
          Meeting code: {booking.dailyRoomName.toUpperCase()} · The call opens in a new tab, where you can share your screen.
        </Text>
      ) : null}
    </View>
  );
}
