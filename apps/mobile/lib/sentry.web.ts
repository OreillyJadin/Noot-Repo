// Web: the browser SDK (@sentry/react) with the same DSN, environment and scrubbing as
// lib/sentry.ts. @sentry/react-native's web mode doesn't install the browser's global
// error handlers, so uncaught errors in the web app would never be reported.
import * as Sentry from '@sentry/react';
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
    beforeSend: (event) => scrubEvent(event as Parameters<typeof scrubEvent>[0]) as typeof event,
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as Parameters<typeof scrubBreadcrumb>[0]) as typeof crumb,
  });
  Sentry.setTag('platform', 'web');
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
