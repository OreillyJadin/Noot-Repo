# Edge Functions

Server-only logic (ARCHITECTURE.md §5). Planned functions:

| Function | Purpose |
|---|---|
| `create-payment-intent` | Held (manual-capture) Stripe PaymentIntent for B4. *(skeleton exists)* |
| `payments-webhook` | Stripe payment, Connect, refund and dispute events. |
| `confirm-booking` | Create booking on payment success, seed chat with B3 intro message. |
| `connect-onboarding-link` | Tutor Stripe Connect onboarding. |
| `complete-session` | Capture payment, transfer payout to tutor. |
| `submit-rating` | Double-blind rating visibility. |
| `cancel-booking` | 12h / 2h student refund tiers; transfers the tutor's share on late cancellations. |
| `reschedule-booking` | Propose/accept new time; 3-reschedule rule. |
| `report-no-show` | No-show thresholds + 3-strike escalation. |
| `auto-complete` (cron) | 24h no-response → auto-complete + release. |
| `send-reminders` (cron) | 24h + 1h session reminders. |
| `leave-tutor-role` | Remove the tutor role and reset the application for a future re-application. |

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

## payments-webhook (Stripe)

Set these Edge Function secrets:

- `STRIPE_SECRET_KEY` — Stripe API key.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the platform endpoint.
- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for the connected-accounts endpoint
  (optional until that endpoint is configured).

Both Stripe endpoints point to
`https://<project>.supabase.co/functions/v1/payments-webhook`.

Configure the platform endpoint ("Your account") to subscribe to
`account.updated`, `charge.refunded`, `charge.dispute.created`,
`charge.dispute.closed`, and `payment_intent.succeeded`.

Configure the Connect endpoint ("Connected accounts") to subscribe to `account.updated`.
Connect events other than `account.updated` are acknowledged without processing.

Handler failures return 500 so Stripe redelivers the event; handlers are idempotent under
redelivery. Set the Connect endpoint signing secret with
`supabase secrets set STRIPE_CONNECT_WEBHOOK_SECRET=...`.
