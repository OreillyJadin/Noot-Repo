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
