# Noot — what *you* need to do (manual steps)

_Updated 2026-07-18._ These are the things Claude can't do for you — dashboard clicks,
decisions, and credentials (Stripe, email, Apple). Everything code-side that doesn't need a
secret is built; this file is the human to-do list for launch.

**Launch blockers, in order:** (1) push this session's new migrations to cloud · (2) real
money (Stripe) · (3) real email (SMTP) · (4) Apple Developer account to submit. Device push
is optional for a first submission.

---

## 0. Which database are you using? (local vs. cloud)

**Day-to-day you're on your cloud project** `nepnxbvseuzuayhxaigo` — `apps/mobile/.env`
points there and Edge Functions are deployed there, so the app works on real phones. The
**local** Docker stack is optional dev tooling (safe sandbox, test migrations before cloud,
local email inbox at http://localhost:54324).

> ⚠️ This session's new features were built + verified against **local**. See §1 — they
> aren't on cloud until you push the migrations.

---

## 1. 🚩 Push this session's new migrations to cloud (do this first)

Migrations `0012`–`0014` were applied to **local only**. Photo upload and notifications
**will not work on cloud / real phones** until these are on cloud:

- `0012_analytics_events.sql` — analytics event log
- `0013_avatars_storage.sql` — public `avatars` Storage bucket + `users.avatar_url` (profile photos)
- `0014_notifications.sql` — `notifications` table + triggers (in-app notification center)

Claude (or you) can push them:

```bash
export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"
supabase db push --project-ref nepnxbvseuzuayhxaigo   # applies pending migrations to cloud
```

Then re-seed/verify as needed. (This is a write to your real DB — that's why it's a manual
"go" rather than something done automatically.)

---

## 2. 💳 Stripe — real money (the big one)

**Decisions locked:** full Stripe at launch; a session is completed when the **tutor taps
"Mark complete"** (that captures the held payment + pays the tutor). **Still undecided:** card
entry method — **PaymentSheet** (native, slick, needs a dev build to test) vs **Checkout**
(hosted web page, works everywhere, easiest). Tell Claude which when you're ready.

**Cost:** test mode is **free** and uses fake cards — no real money. Live mode only charges
Stripe's per-transaction fee when you actually get paid.

### Your steps (Stripe dashboard)
1. **Create (or open) a Stripe account** at https://dashboard.stripe.com. Stay in **Test mode**
   (toggle, top-right) for all of the below.
2. **Get your API keys** — Developers → API keys:
   - **Publishable key** `pk_test_…` (safe for the app/client)
   - **Secret key** `sk_test_…` (server only — never commit it)
3. **Enable Connect** (so tutors can get paid) — Connect → Get started → choose **Express**
   accounts. Free in test. This is what lets us onboard tutors + send payouts.
4. **(Later, to go live)** complete Stripe business verification, then repeat with **live**
   keys (`pk_live_…` / `sk_live_…`). Don't do this until you're ready to take real money.

### Where the keys go (Claude can run these once you paste the values)
- **Secret key → Supabase Edge Function secret** (used by `create-payment-intent` and the
  upcoming capture/Connect functions):
  ```bash
  supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx --project-ref nepnxbvseuzuayhxaigo
  ```
- **Publishable key → mobile env** (`apps/mobile/.env`, for client card entry once built):
  ```
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
  ```

### What's already built vs. still to build
- ✅ `create-payment-intent` already creates a **real manual-capture hold** the moment
  `STRIPE_SECRET_KEY` is set (it simulates otherwise). So a booking will place a real hold as
  soon as you set the secret.
- 🔴 **Not built yet** (Claude builds these once keys exist so they can be verified):
  capture-on-completion + the tutor "Mark complete" action, **Stripe Connect onboarding** for
  tutors, payout transfers, and real **card entry** (PaymentSheet or Checkout).

### Test cards (test mode)
- Success: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- More scenarios: https://stripe.com/docs/testing.

---

## 3. ✉️ Real email (SMTP) — for `.edu` signup + password reset

The app-side is built; real students can't receive a verification/reset email until you set
up SMTP on cloud. In the Supabase **dashboard** for `nepnxbvseuzuayhxaigo`:

1. **Authentication → Emails → SMTP Settings → enable Custom SMTP.** Use a provider (Resend /
   Postmark / SendGrid / AWS SES) with a verified sending domain (SPF + DKIM). Fill host, port
   (587/465), username, password, sender email + name ("Noot").
2. **Authentication → URL Configuration** — allow the redirect targets so the emailed link
   returns to the app:
   - `http://localhost:8081` and `http://localhost:8081/**` (web dev)
   - `noot://` and `noot://**` (device builds)
   - your future production web origin.
3. **Authentication → Rate Limits** — raise the email send rate above the tiny default.
4. **Test:** sign up with a real `@crimson.ua.edu` address → email arrives from your domain →
   the link signs you in.

Until then, the seeded demo accounts (`student@crimson.ua.edu` / `sara@crimson.ua.edu`,
password `password123`) are pre-confirmed and work today.

📱 **Phone caveat:** in **Expo Go** the deep-link scheme is `exp://…`, not `noot://`; the
`noot://` return only works in a real dev/production build.

---

## 4. 🍎 Apple / App Store (to actually submit)

- **Apple Developer Program — $99/yr** (unavoidable to publish to the App Store).
- Tutoring is a real-world service between people, so you can use **Stripe instead of Apple's
  in-app-purchase 30%** (like Uber/Airbnb) — no IAP required.
- You'll need an **EAS build** (Expo) to produce the app binary; free tier exists. Ask Claude
  to set up `eas.json` + the build when you're ready.
- Device **push notifications** (if you add them later) use APNs, included with the $99 account.

---

## 5. Redeploy an Edge Function after it changes

```bash
export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"
supabase functions deploy confirm-booking --project-ref nepnxbvseuzuayhxaigo
# or deploy everything:
supabase functions deploy --project-ref nepnxbvseuzuayhxaigo
```

New DB migrations go to cloud with `supabase db push` (see §1).

---

## 6. Local stack gotchas (only if you use local)

- `node` isn't on PATH: `export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"`.
- Postgres is **17**.
- **Adding a new Edge Function?** The local edge runtime only picks it up after a full
  `supabase stop && supabase start` (a plain restart won't see it).
- Re-seed demo data any time: `node supabase/seed_demo.mjs`.
