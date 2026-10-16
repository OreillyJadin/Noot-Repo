import * as Sentry from '@sentry/react-native';
import { auth } from '@noot/core';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

let enabled = false;
let unsubscribe: (() => void) | undefined;

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? 'development' : 'production'),
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  enabled = true;
}

export function trackSentryUser(): void {
  if (!enabled) return;

  const updateUser = () => {
    void auth
      .getSessionUserId()
      .then((id) => Sentry.setUser(id ? { id } : null))
      .catch(() => {});
  };

  try {
    updateUser();
    unsubscribe ??= auth.onAuthChange(updateUser);
  } catch {
    return;
  }
}
