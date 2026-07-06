# Noot — what *you* need to do (manual steps)

_Updated 2026-07-06._ These are the things Claude can't do for you — dashboard clicks,
decisions, and credentials. Everything code-side for booking + magic-link sign-in is
already built and verified.

---

## 0. Which database are you using? (local vs. "a real DB")

**You are already using your real cloud database.** `apps/mobile/.env` points the app at
your cloud project `nepnxbvseuzuayhxaigo`, and all Edge Functions are deployed there. So
sign-in, tutor search, and booking all run against the real DB right now — including on a
real phone via Expo Go.

The **local stack** (the Docker/Postgres thing that just broke) is *optional* developer
tooling, not required to run the app. What it's good for:

- Fast, offline iteration and a throwaway sandbox you can wipe without touching real data.
- Testing a new DB migration before pushing it to cloud (`supabase db push`).
- Magic-link emails land in a local inbox (Mailpit, http://localhost:54324) instead of
  needing a real email provider.

**Recommendation:** use **cloud** as your day-to-day database (simplest, real, works on
phones). Keep the local stack only if/when you want to test schema changes safely first.
If you'd rather not deal with local at all, you can ignore it — nothing in the app depends
on it. (Only the `scripts/verify_*` smoke tests default to local; the `_cloud` one targets
cloud.)

To point the app back at **local** instead: in `apps/mobile/.env`, comment the cloud
`EXPO_PUBLIC_SUPABASE_*` lines and uncomment the local ones (the local stack must be running).

---

## 1. Bookings — ✅ DONE and already live (nothing for you to do)

The `confirm-booking` Edge Function (and `create-payment-intent`, `cancel-booking`,
`reschedule-booking`, `report-no-show`, `submit-rating`) are **deployed to cloud and
ACTIVE**, and the app is wired to them. Verified end-to-end against cloud on 2026-07-06:
book a session → it appears in Upcoming → cancel → 100% refund.

⚠️ **Money is simulated.** Payments use a fake PaymentIntent (`sim_pi_…`) — no real card is
charged and no payout is sent. Wiring real Stripe is future work (see ARCHITECTURE.md §5).
Don't take real bookings for money until that's done.

---

## 2. Magic-link sign-in for real `.edu` students — needs SMTP (your dashboard task)

The app-side is built (see `HANDOFF_CLAUDE.md` → "Magic-link deep-linking"). Real students
still can't receive a link until you configure email on cloud. In the Supabase **dashboard**
for project `nepnxbvseuzuayhxaigo`:

1. **Authentication → Emails → SMTP Settings → enable Custom SMTP.** Use a provider
   (Resend / Postmark / SendGrid / AWS SES) with a verified sending domain (SPF + DKIM).
   Fill host, port (587/465), username, password, sender email + name ("Noot").
2. **Authentication → URL Configuration** — add your redirect targets so the emailed link
   is allowed back in. Mirror what's in `supabase/config.toml`:
   - `http://localhost:8081` and `http://localhost:8081/**` (web dev)
   - `noot://` and `noot://**` (device builds)
   - plus your future production web origin.
   (Cloud dashboard settings are **separate** from `config.toml`, which only drives local.)
3. **Authentication → Rate Limits** — raise the email send rate above the tiny default.
4. **Test:** sign up with a real `@crimson.ua.edu` address → the email should arrive from
   your domain → tapping the link signs you in.

Until then, use the seeded demo accounts (`student@crimson.ua.edu` /
`sara@crimson.ua.edu`, password `password123`) — they're pre-confirmed and work today.

📱 **Phone caveat:** in **Expo Go**, the deep-link scheme is `exp://…`, not `noot://`. The
`noot://` return only works in a real dev/production build. Web dev works today.

---

## 3. If an Edge Function changes later — redeploy it

You (via `supabase login`, already done) or Claude can redeploy after editing a function:

```bash
export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"
supabase functions deploy confirm-booking --project-ref nepnxbvseuzuayhxaigo
# or deploy everything:
supabase functions deploy --project-ref nepnxbvseuzuayhxaigo
```

New DB migrations go to cloud with `supabase db push`.

---

## 4. Local stack gotchas (only if you use local)

- `node` isn't on PATH: `export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"`.
- Postgres is now **17** (was 15; the version mismatch is what broke local on 2026-07-06 —
  fixed by resetting the volume and re-seeding).
- **Adding a new Edge Function?** The local edge runtime only picks it up after a full
  `supabase stop && supabase start` (a plain container restart won't see it).
- Re-seed demo data any time: `node supabase/seed_demo.mjs`.
