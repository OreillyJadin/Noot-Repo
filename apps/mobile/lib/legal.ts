// The legal pages live on the marketing site — App Store Connect needs a public privacy
// URL anyway, so the app links it rather than duplicating the text.
import * as WebBrowser from 'expo-web-browser';

/** The public site — also the link a "Refer a friend" invite sends. */
export const SITE_URL = 'https://trynoot.com';
export const LEGAL_BASE = SITE_URL;

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
 * Both pages are plain links opened in a browser, so the destinations can go live after a
 * build ships — nothing here is baked into behaviour beyond the path itself.
 *
 * `/terms` was a 404 as of 2026-09-21 and is being published separately from `/privacy`
 * (APP_REVIEW_TICKETS.md T23, text in legal/TERMS_OF_USE.md). **It must be live before the
 * app is submitted**: a reviewer tapping "Terms of Use" and getting a 404 is a Guideline
 * 1.2 failure, and the sign-up checkbox links straight here.
 */
const PATHS: Record<'privacy' | 'terms', string> = { privacy: '/privacy', terms: '/terms' };

export const openLegal = (page: 'privacy' | 'terms') =>
  WebBrowser.openBrowserAsync(`${LEGAL_BASE}${PATHS[page]}`).catch(() => {});
