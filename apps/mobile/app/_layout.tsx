// Root layout — initializes Supabase and wraps the app in the theme.
// expo-router: this file is the nav root. Model the handoff's stack here
// (tabs-as-roots, onboarding locked after completion — ARCHITECTURE.md §12).
import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '@noot/ui';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { initSupabase } from '@noot/core';
import { AppProvider } from '../lib/store';
import { MeProvider } from '../lib/useMe';
import { AuthGate } from '../lib/AuthGate';
import { PushRegistrar } from '../lib/PushRegistrar';
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

// Reads the persisted theme preferences and feeds them into the theme + status bar.
// `school` swaps the accent to crimson (the "school colors" theme) — a colour choice, not
// a university mark.
function ThemedApp() {
  const { dark, school } = useThemePref();
  // @stripe/stripe-react-native's native module isn't in Expo Go, so mounting
  // StripeProvider there would crash the whole app. Only mount it in a real build
  // (dev-client / standalone); Expo Go keeps working for everything except PaymentSheet.
  const inExpoGo = Constants.appOwnership === 'expo';
  const tree = (
    <AppProvider>
      <MeProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
        <PushRegistrar />
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
            <Stack.Screen name="admin_tutors" options={{ animation: 'fade' }} />
            <Stack.Screen name="admin_users" options={{ animation: 'fade' }} />
            <Stack.Screen name="admin_bookings" options={{ animation: 'fade' }} />
            <Stack.Screen name="admin_reviews" options={{ animation: 'fade' }} />
            <Stack.Screen name="admin_reports" options={{ animation: 'fade' }} />
            {/* The only replace INTO a tutor-application step is its back arrow after
                resuming a draft (lib/stepBack.ts), so it slides the way a back does. */}
            {['t2', 't3', 't4', 't5', 't6', 't7', 't8'].map((name) => (
              <Stack.Screen key={name} name={name} options={{ animationTypeForReplace: 'pop' }} />
            ))}
          </Stack>
        </AuthGate>
      </MeProvider>
    </AppProvider>
  );
  return (
    <ThemeProvider direction={school ? 'crimson' : 'sage'} dark={dark}>
      {inExpoGo ? (
        tree
      ) : (
        <StripeProvider
          publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
          merchantIdentifier="merchant.com.watchmenventures.noot"
          urlScheme="noot"
        >
          {tree}
        </StripeProvider>
      )}
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
