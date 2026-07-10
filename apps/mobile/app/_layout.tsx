// Root layout — initializes Supabase and wraps the app in the theme.
// expo-router: this file is the nav root. Model the handoff's stack here
// (tabs-as-roots, onboarding locked after completion — ARCHITECTURE.md §12).
import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '@noot/ui';
import { initSupabase } from '@noot/core';
import { AppProvider } from '../lib/store';
import { AuthGate } from '../lib/AuthGate';
import { largeSecureStore } from '../lib/secureStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (url && anonKey) {
  // Native persists the session + PKCE verifier in the OS keystore (encrypted, via
  // LargeSecureStore) so a magic link opened after the app was backgrounded still
  // resolves — and tokens never sit in plaintext. Web uses localStorage.
  initSupabase({
    url,
    anonKey,
    storage: Platform.OS === 'web' ? undefined : largeSecureStore,
  });
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider direction="sage" dark={false}>
        <AppProvider>
          <StatusBar style="auto" />
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGate>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
