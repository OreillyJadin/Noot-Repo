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
import { ThemePrefProvider, useThemePref } from '../lib/themePref';

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

// Reads the persisted dark-mode preference and feeds it into the theme + status bar.
function ThemedApp() {
  const { dark } = useThemePref();
  return (
    <ThemeProvider direction="sage" dark={dark}>
      <AppProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <AuthGate>
          {/* Tab roots cross-fade instead of the jerky horizontal slide; drill-down
              screens (booking, edit, etc.) keep the default push animation. */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="home" options={{ animation: 'fade' }} />
            <Stack.Screen name="student_home" options={{ animation: 'fade' }} />
            <Stack.Screen name="sessions" options={{ animation: 'fade' }} />
            <Stack.Screen name="saved" options={{ animation: 'fade' }} />
            <Stack.Screen name="profile" options={{ animation: 'fade' }} />
            <Stack.Screen name="tutor_home" options={{ animation: 'fade' }} />
            <Stack.Screen name="tutor_calendar" options={{ animation: 'fade' }} />
            <Stack.Screen name="tutor_sessions" options={{ animation: 'fade' }} />
            <Stack.Screen name="tutor_profile" options={{ animation: 'fade' }} />
            <Stack.Screen name="ambassador_home" options={{ animation: 'fade' }} />
            <Stack.Screen name="ambassador_referrals" options={{ animation: 'fade' }} />
            <Stack.Screen name="admin_home" options={{ animation: 'fade' }} />
          </Stack>
        </AuthGate>
      </AppProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemePrefProvider>
        <ThemedApp />
      </ThemePrefProvider>
    </SafeAreaProvider>
  );
}
