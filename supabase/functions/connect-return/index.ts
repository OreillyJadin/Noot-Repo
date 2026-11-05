// Edge Function: connect-return.
// The https address Stripe sends a tutor back to after Connect's hosted payout onboarding.
// All it does is redirect into the app (noot://connect-return, or noot://connect-refresh
// when Stripe says the link expired), which is what closes the in-app browser.
//
// Why it exists (ERR-002): connect-onboarding-link used to give Stripe the app's own
// noot:// addresses. The sandbox accepts those; LIVE mode only accepts https, so after the
// sandbox → live cutover every request failed with "Not a valid URL" and the app showed
// "Could not open payout setup" to every tutor on step 8.
//
// Deployed with JWT verification OFF (supabase/config.toml): Stripe redirects a browser
// here, which carries no session. That is safe — it reads nothing, writes nothing, and can
// only ever redirect to the two fixed app addresses below (never to a caller-supplied URL).
import { serveWithErrorReporting } from '../_shared/observability.ts';
const TARGETS: Record<string, string> = {
  return: 'noot://connect-return',
  refresh: 'noot://connect-refresh',
};

// The web app opens onboarding in a browser tab (connect-onboarding-link returnTo: 'web').
// There is no app to redirect into, so the tab just says it's done. Plain text: Supabase
// serves function responses as text, never as a page.
const WEB_MESSAGES: Record<string, string> = {
  web: 'Payout setup is saved. You can close this tab and go back to noot.',
  'web-refresh': 'This payout setup link expired. Close this tab and choose Payout account in noot again.',
};

serveWithErrorReporting('connect-return', (req: Request) => {
  const to = new URL(req.url).searchParams.get('to') ?? 'return';
  if (WEB_MESSAGES[to]) {
    return new Response(WEB_MESSAGES[to], {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const location = TARGETS[to] ?? TARGETS.return;
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });
});
