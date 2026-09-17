// The legal pages live on the marketing site — App Store Connect needs a public privacy
// URL anyway, so the app links it rather than duplicating the text.
import * as WebBrowser from 'expo-web-browser';

export const LEGAL_BASE = 'https://trynoot.com';

/**
 * Where users are told to reach us: the Help & support screen and the footer of every auth
 * email. Not the same as the SMTP *sender* (support@trynoot.com) — see
 * scripts/push_auth_templates.mts.
 */
export const SUPPORT_EMAIL = 'admin@trynoot.com';

/**
 * The Terms version a new user accepts at sign-up, stored in users.terms_version.
 * Keep this in step with the effective date of `legal/TERMS_OF_USE.md`, which is the source
 * of truth for the published document — if the terms change materially, bump it in both
 * places so acceptance records stay meaningful. (The live site is not built from apps/web.)
 */
export const TERMS_VERSION = '2026-09-17';

/**
 * Terms and Privacy are served from the same page for now — the combined document at
 * /privacy covers both. Split `terms` back out once a standalone /terms page is live.
 */
const PATHS: Record<'privacy' | 'terms', string> = { privacy: '/privacy', terms: '/privacy' };

export const openLegal = (page: 'privacy' | 'terms') =>
  WebBrowser.openBrowserAsync(`${LEGAL_BASE}${PATHS[page]}`).catch(() => {});
