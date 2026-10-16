export interface PushNotification {
  type: string;
  title: string;
  data: Record<string, unknown>;
}

let appReady = false;
let pending: PushNotification | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function markAppReady() {
  appReady = true;
  notify();
}

export function markAppNotReady() {
  appReady = false;
  notify();
}

export function isAppReady(): boolean {
  return appReady;
}

export function setPendingPushOpen(notification: PushNotification) {
  pending = notification;
  notify();
}

export function takePendingPushOpen(): PushNotification | null {
  const notification = pending;
  pending = null;
  return notification;
}

export function subscribePushOpen(listener: () => void): () => void {
  listeners.add(listener);
  listener();
  return () => {
    listeners.delete(listener);
  };
}
