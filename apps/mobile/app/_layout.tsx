// Root layout — initializes Supabase and wraps the app in the theme.
// expo-router: this file is the nav root. Model the handoff's stack here
// (tabs-as-roots, onboarding locked after completion — ARCHITECTURE.md §12).
import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@noot/ui';
import { initSupabase } from '@noot/core';
import { AppProvider } from '../lib/store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (url && anonKey) {
  // Native persists the session + PKCE verifier in AsyncStorage so a magic link
  // opened after the app was backgrounded still resolves. Web uses localStorage.
  initSupabase({
    url,
    anonKey,
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
  });
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider direction="sage" dark={false}>
        <AppProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
