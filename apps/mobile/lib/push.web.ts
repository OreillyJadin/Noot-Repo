// Web: no push notifications in the browser yet (a later item), so nothing registers a
// token and the notifications screen hides its push prompt ('unavailable'). The in-app
// feed still works: it reads the notifications table, not the push path. Same exports as
// lib/push.ts, which keeps expo-notifications out of the web bundle.
import type { PushState } from './pushState';
import { markAppNotReady } from './pushOpen';
import type { PushNotification } from './pushOpen';

export function onPushOpened(_cb: (notification: PushNotification) => void): () => void {
  return () => {};
}

export function onPushReceived(_cb: () => void): () => void {
  return () => {};
}

export async function getPushState(): Promise<PushState> {
  return 'unavailable';
}

export async function askForPush(): Promise<PushState> {
  return 'unavailable';
}

export async function openPushSettings(): Promise<void> {}

export async function registerThisDevice(): Promise<void> {}

export async function forgetThisDevice(): Promise<void> {
  markAppNotReady();
}
