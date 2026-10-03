# Edge Functions

Server-only logic (ARCHITECTURE.md §5). Planned functions:

| Function | Purpose |
|---|---|
| `create-payment-intent` | Held (manual-capture) Stripe PaymentIntent for B4. *(skeleton exists)* |
| `stripe-webhook` | payment/connect/refund events. |
| `confirm-booking` | Create booking on payment success, seed chat with B3 intro message. |
| `connect-onboarding-link` | Tutor Stripe Connect onboarding. |
| `complete-session` | Capture payment, transfer payout to tutor. |
| `submit-rating` | Double-blind rating visibility. |
| `cancel-booking` | Refund-tier math + cancellation-rate tracking. |
| `reschedule-booking` | Propose/accept new time; 3-reschedule rule. |
| `report-no-show` | No-show thresholds + 3-strike escalation. |
| `auto-complete` (cron) | 24h no-response → auto-complete + release. |
| `send-reminders` (cron) | 24h + 1h session reminders. |

## Stripe Connect return address (ERR-002)

Stripe live mode only accepts https return URLs, so `connect-onboarding-link` sends tutors
back to the `connect-return` function, which redirects into the app (`noot://connect-return`).

- **Deploy order:** `connect-return` must be live **with JWT verification off** before (or
  with) `connect-onboarding-link`. `supabase functions deploy connect-return` from the repo
  picks that up from `config.toml`; any other deploy path must pass `verify_jwt: false`, or
  Stripe returns the tutor to a 401 page that never closes.
- **Local:** inside the local stack `SUPABASE_URL` is an internal address a phone can't
  reach. Set `CONNECT_RETURN_BASE_URL` in the functions env (e.g. your tunnel or LAN URL for
  the API on :54321) to test the full return on a device.

