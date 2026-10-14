import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@noot/core';
import { ActionBar, Body, Button, Card, H2, NavTop, Screen, Sub, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { NoSession } from '../lib/NoSession';

export default function DeclineBookingRequest() {
  const { booking } = useApp();
  if (!booking.bookingId) return <NoSession />;
  return <DeclineBookingRequestInner />;
}

function DeclineBookingRequestInner() {
  const { booking } = useApp();
  const router = useRouter();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const decline = async () => {
    if (!booking.bookingId || busy) return;
    setBusy(true);
    try {
      await api.bookings.respond({ bookingId: booking.bookingId, action: 'decline', note: note.trim() || undefined });
      router.replace('/tutor_sessions');
    } catch (e) {
      Alert.alert('Could not decline request', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Decline request" onBack={() => router.back()} />
      <Body pad={20}>
        <View style={{ paddingTop: 10 }}>
          <H2>Let the student know</H2>
          <Sub style={{ marginTop: 8 }}>The student won&apos;t be charged, and any Noot credit they used is returned.</Sub>
        </View>
        <Card style={{ marginTop: 20, padding: 14 }}>
          <Text style={[styles.label, { color: t.text }]}>Optional note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={300}
            multiline
            placeholder="Add a short note for the student"
            placeholderTextColor={t.text3}
            style={[styles.input, { color: t.text, borderColor: t.border }]}
            textAlignVertical="top"
          />
          <Text style={[styles.counter, { color: t.text3 }]}>{note.length}/300</Text>
        </Card>
      </Body>
      <ActionBar style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Button kind="primary" full disabled={busy} label={busy ? 'Declining…' : 'Decline request'} onPress={() => void decline()} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  input: { minHeight: 112, marginTop: 10, padding: 12, borderWidth: 1, borderRadius: 12, fontSize: 14 },
  counter: { marginTop: 6, textAlign: 'right', fontSize: 12 },
});
