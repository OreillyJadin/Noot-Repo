# noot — Architecture

Single source of truth for how **noot** (peer-to-peer campus tutoring) is built across every
surface. Merges the client architecture with the two-phase infrastructure plan
(`infrastructure-plan.md`). The UI/UX contract lives in `design_handoff_noot_app/`
(`HANDOFF.md` is authoritative for screens, tokens, and behavior).

**Launch target:** University of Alabama, Fall 2026. One account holds both **student** and
**tutor** roles (mode switch in Profile).

---

## 1. Surfaces & stack

Four surfaces, mostly one React codebase — the design handoff is already React, so the port is direct.

| Surface | Tech | Notes |
|---|---|---|
| iOS app | **Expo (React Native)** | From `apps/mobile`. |
| Android app | **Expo (React Native)** | Same code as iOS. |
| Web app (full product) | **Expo + React Native Web** | Same `apps/mobile` code, `expo export --platform web`. Students/tutors book, pay, chat in-browser. |
| Marketing site | **Next.js** | `apps/web`. Public, SEO-friendly front door → waitlist, "how it works", app-store + web-app links. |

**Backend:** Supabase (Postgres + Auth + Storage + Realtime + **Edge Functions**) + **Stripe Connect**.
No standing API server at launch — server-only logic runs as Edge Functions (see §5).

**Design system:** ported from the handoff — sage `#78A070` (accent), deep charcoal-green
`#283028` (ink), cream/sand `#D0C0A0`; Poppins headings, system UI body. Three theme directions
(`sage` default / `sand` / `forest`) + dark mode, expressed as tokens (`packages/theme`).

---

## 2. Monorepo layout

```
noot/
├─ apps/
│  ├─ mobile/                 Expo app → iOS, Android, web app (RN Web)
│  │  └─ app/                 expo-router routes (mirrors screens-map.jsx keys)
│  └─ web/                    Next.js marketing site (public)
├─ packages/
│  ├─ ui/                     component kit ported from app/kit.jsx (RN + RN Web)
│  ├─ theme/                  design tokens from theme.jsx → typed TS (THEMES, tokens)
│  ├─ core/                   domain logic, types, and the data-layer client (see §7)
│  │  ├─ auth/                thin wrapper over Supabase Auth (keeps Phase 2 a swap)
│  │  ├─ api/                 typed calls to Edge Functions + Supabase queries
│  │  └─ models/             Booking, Session, Thread, Rating, Payout types
│  └─ config/                 shared tsconfig / eslint / prettier
├─ supabase/
│  ├─ migrations/             SQL schema (§4)
│  ├─ functions/             Edge Functions (§5)
│  └─ seed.sql                dev seed (mirrors booking-data.jsx demo data)
├─ design_handoff_noot_app/   design source of truth (do not ship directly)
├─ infrastructure-plan.md     two-phase infra strategy
└─ ARCHITECTURE.md            this file
```

Tooling: pnpm workspaces + Turborepo (or Nx). TypeScript everywhere.

---

## 3. Backend — Phase 1 (launch)

Managed services, near-zero ops. Per `infrastructure-plan.md`.

| Concern | Service |
|---|---|
| Database | Supabase Postgres (relational — fits bookings/profiles/ratings) |
| Auth | Supabase Auth — `.edu` magic link (§6) |
| Server logic | **Supabase Edge Functions** (Deno) — Stripe + trust-sensitive rules (§5) |
| File storage | Supabase Storage — chat attachments; profile photos if added later |
| Realtime | Supabase Realtime — chat threads, live session/booking updates |
| Scheduled jobs | `pg_cron` / Supabase scheduled functions — reminders, 24h auto-complete |
| Payments | Stripe Connect — held payments + tutor payouts (§8) |

**Why Edge Functions, not a Railway server (yet):** the only code that *must* live server-side is
Stripe (secret key + webhooks) and the trust rules (payout capture, double-blind ratings, refund
math, strike counts). That's a handful of functions, not a standing service — Edge Functions cover
it at two vendors instead of three. Promote to a dedicated API (Railway/Fly) only if this logic
outgrows functions.

---

## 4. Data model (Postgres)

Sketch of the core tables backing the handoff's entities. RLS on every table.

```
auth.users                    ← Supabase-managed identity (magic link)

profiles                      1:1 with auth.users
  id (fk auth.users) · full_name · email · college · avatar_initials
  is_student · is_tutor · active_role · created_at

tutor_profiles                1:1 with a profile (when is_tutor)
  user_id · headline · bio · grade_verification_status(draft|submitted|verified)
  stripe_account_id · status(draft|in_review|active) · sessions_completed
  rating_avg  ← PRIVATE, never exposed student-facing (credibility = sessions_completed)

tutor_courses                 per-course offerings + rates
  id · tutor_id · course_code(e.g. MGT 300) · title · rate_cents

availability_templates        recurring open blocks (tutor's weekly template, T5)
  tutor_id · weekday · start_time · end_time
availability_overrides        one-off open/close (calendar tap-to-toggle, TC)
  tutor_id · date · start_time · end_time · is_open

bookings                      the unit of work (auto-confirm model — no approval step)
  id · student_id · tutor_id · course_code · starts_at · ends_at · length_min
  location · video_url · video_provider  ← external link at launch (§9); null for in-person
  focus_tag(general|hw|exam|resume|advising) · intro_message
  repeat(once|weekly) · series_id  ← recurring series link
  price_cents · service_fee_cents(0 at launch) · status(confirmed|completed|cancelled|no_show)
  stripe_payment_intent_id · created_at

chat_threads                  one per (student, tutor) pair
  id · student_id · tutor_id
chat_messages
  id · thread_id · sender_id · body · created_at
message_attachments
  id · message_id · storage_path · kind(image|file) · filename

ratings                       double-blind (§8)
  id · booking_id · rater_id · ratee_id · stars(1-5) · note
  is_public  ← student→tutor review public; tutor→student note PRIVATE
  visible    ← false until BOTH sides submit (or 24h auto-complete)

disputes                      "did this happen as expected? No" → pauses payout
  id · booking_id · opened_by · reason · status

payouts
  id · tutor_id · booking_id · amount_cents · stripe_transfer_id · status · released_at

incidents                     drives cancellation-rate + no-show strikes (§8)
  id · user_id · type(cancel|no_show) · booking_id · created_at
```

**RLS highlights:** a profile reads/writes only its own row; bookings visible only to their
student or tutor; chat rows only to thread participants; `ratings` hidden until `visible=true`;
`tutor_profiles.rating_avg` and `ratings.note` (tutor→student) never returned to students.

---

## 5. Edge Functions (server-only logic)

Everything the client can't be trusted to do. Deno, in `supabase/functions/`.

| Function | Trigger | Responsibility |
|---|---|---|
| `create-payment-intent` | B4 pay | Create Stripe PaymentIntent, **manual capture** (held), `application_fee_amount` (Free/$0 at launch). |
| `stripe-webhook` | Stripe | `payment_intent.succeeded` → confirm booking; `account.updated` → tutor Connect onboarding status; refunds/transfers. |
| `confirm-booking` | after payment | Create `bookings` row (+ series for weekly), drop B3 intro message into the thread (B5), fire TB1 to tutor. |
| `connect-onboarding-link` | T9 payout setup | Create Stripe Connect account + hosted onboarding link. |
| `complete-session` | C-flow / cron | Capture held payment, create transfer/payout to tutor's connected account. |
| `submit-rating` | C2 / C3 | Store rating; flip `visible=true` only when both sides have rated (double-blind). |
| `cancel-booking` | X1 / X2 | Refund-tier math (>24h 100% · 2–24h 50% · <2h/no-show 0%); tutor-cancel = student 100%, log `incidents` (cancellation rate >2/30d). |
| `reschedule-booking` | X3 / X4 | Propose/accept new time; enforce 3-reschedule → auto-refund+credit. |
| `report-no-show` | X5 | Threshold checks; 3-strike escalation (warn → 30-day pre-pay → suspension). |
| `auto-complete` (scheduled) | `pg_cron` | If neither side rates within 24h → auto-complete + release payment. |
| `send-reminders` (scheduled) | `pg_cron` | 24h + 1h reminders (location / video link on the 1h). |

Client never touches the Stripe secret key or writes `bookings`/`payouts`/`ratings.visible` directly.

---

## 6. Auth — `.edu` magic link

- **Flow:** O2 sign-up → Supabase Auth magic link (email OTP) → O3 verified → O4 role. Matches
  the handoff's ".edu magic link" onboarding. No passwords.
- **Domain gating:** Supabase has no built-in domain restriction. Enforce `@crimson.ua.edu` (and
  future campuses) with a **Supabase Auth Hook** (`before-user-created`) or a Postgres trigger on
  `auth.users` that rejects non-approved domains. Keep the allowlist in a `campuses` table so
  adding a school is a data change, not a deploy.
- **Roles:** one account, `is_student` / `is_tutor` / `active_role` on `profiles`. Profile →
  "Become a tutor" / "Switch to student mode" flips `active_role`; the role-aware tab bar reads it.
- **Abstraction:** all auth goes through `packages/core/auth` — so the Phase 2 Cognito swap is a
  wrapper change, not an app-wide rewrite (auth is the stickiest thing to migrate).

---

## 7. State & data layer

The prototype's `NootStore` (localStorage-backed chat threads + sessions) is the **shape** to
reproduce against the real backend — do not port localStorage.

- **Server state:** TanStack Query over `packages/core/api` (Supabase queries + Edge Function calls).
- **Realtime:** Supabase Realtime subscriptions for chat messages and booking/session status.
- **Booking-in-progress:** the handoff's `booking` object (course, tutor, day, slot, length,
  location, focus tag, intro message, repeat) held in local state through B3→B4→B5, persisted only
  on confirm.
- **Empty states are first-class:** brand-new users have no streak/sessions/bookings. Design real
  zero states — do NOT port the demo numbers ("512 active tutors", streaks, earnings). First
  impressions at launch are all empty states.

---

## 8. Payments — Stripe Connect

- **Model:** auto-confirm — student picks an available block, pays into a **held** payment, booking
  confirms instantly (no tutor approval). Funds released to the tutor on completion.
- **B4:** Stripe **Payment Element** / Express Checkout (Apple Pay / Google Pay + card). Manual
  capture. Service fee shown as its own line — **Free ($0.00)** at launch (`application_fee_amount`,
  toggle on later). Test cards: `4242` approves · `0002` declines.
- **Payout:** on completion, capture the PaymentIntent and transfer to the tutor's connected
  account (payout within ~2 business days, per C4 copy). Tutor Connect onboarding is T9.
- **Double-blind ratings:** C2/C3 stay hidden until both submit (prevents retaliation); 24h no
  response → auto-complete + release. Enforced in `submit-rating` / `auto-complete`, never client-side.
- **Refunds / disputes / strikes:** all math and counters are server rules (see §5 `cancel-booking`,
  `report-no-show`) — the screens only surface states and copy.
- Payments are **hosting-independent** — unchanged across Phase 1 and Phase 2.

---

## 9. Video calling

**Launch = external link (Option A). No video is built.** noot stores an optional video URL on the
booking; the session detail screen and the 1h reminder surface a "Join" link that opens the
external tool. This is exactly what the handoff already assumes ("location **or video link** rides
the 1-hour reminder"). Zero video infra, ships day one.

- **Data:** a `video_url` (+ optional `video_provider`) field on `bookings`. In-person sessions
  leave it null and show `location` instead.
- **Link source (small open decision):** default to **auto-generating** a free room link per
  session via an Edge Function (e.g. a Daily room, or Google Meet via the Calendar API) so it feels
  built-in; fall back to a tutor-pasted URL. Auto-generate is a tiny function, not an SDK
  integration.
- **Hosting-independent** — like Stripe, unaffected by the Phase 2 AWS migration.

**Not at launch:** in-app WebRTC, screen share, recording. Recording `.edu` sessions carries
consent/FERPA weight and is deliberately deferred.

**Future upgrade path (Option B, if demand validates):** swap the external link for an **embedded
managed SDK** (Daily / Stream / LiveKit) rendered inside noot. Room/token minting is another Edge
Function (same shape as Stripe), and it sits behind `packages/core` — so the "Join" affordance and
session lifecycle stay; no UI redesign. Requires leaving Expo Go for an EAS dev build (WebRTC needs
native modules). Rough effort: ~1–2 wks basic 1:1, ~3–5 wks production-grade.

## 10. Phase 2 — AWS migration (scale-up, not launch)

Trigger: thousands of active users / transaction volume where managed per-user cost outweighs
self-hosting ops. Per `infrastructure-plan.md`.

| Phase 1 | Phase 2 (AWS) | Migration note |
|---|---|---|
| Supabase Postgres | RDS (PostgreSQL) | Same engine — schema-compatible, low risk. |
| Supabase Auth | Cognito (or custom) | **Stickiest lift** — re-home identities/sessions. Mitigated by `packages/core/auth` wrapper + passwordless magic-link (no password DB to migrate). |
| Edge Functions | ECS/Fargate | Containerize the same logic; no OS management. |
| Supabase Storage | S3 | Direct replacement. |
| Stripe Connect | Stripe Connect | Unchanged. |

Keep data-access and auth behind `packages/core` so screens never import Supabase directly —
that's what makes Phase 2 a swap rather than a rewrite.

### Phase 2 impact on the design handoff / UI

**Near zero — by design.** The handoff is a UI/UX contract; Phase 2 is a backend/infra swap. They
sit on opposite sides of `packages/core`, so migrating to AWS re-touches **no screens, tokens,
flows, or copy** — the handoff stays 100% valid. What gets re-pointed (Stripe/webhooks, realtime
chat, storage, scheduled jobs) changes the *wire*, not the *interface*: the input/state/copy
contract each surface expects is identical on Supabase or AWS.

This only holds if the boundary is respected: **screens must never import the Supabase client
directly** — all data access and auth go through `packages/core`. The moment a component reaches
past it, that's a site Phase 2 has to hunt down and rewrite.

**Guardrail:** an ESLint rule banning `@supabase/*` (and `stripe`) imports anywhere outside
`packages/core` and `supabase/functions`. Add it at scaffold time so the handoff-derived UI stays
migration-agnostic from day one.

---

## 11. Environments & secrets

- **Environments:** local (Supabase CLI) · staging · production Supabase projects.
- **Secrets:** Stripe keys, service-role key, webhook signing secret live only in Edge Function env
  (never in the app bundle). Client uses the anon key + RLS.
- **Config:** per-environment `.env` per app; typed config in `packages/config`.

---

## 12. Do-not-port (from the prototype)

`ios-frame.jsx`, `tweaks-panel.jsx`, the Jump-to launcher / corner label in `tc-app.jsx`, in-browser
Babel/CDN loading, and localStorage persistence (`tc_unified_nav_v1`). These are review-only. Keep
the nav-stack model (`go`/`back`, tabs-as-roots, onboarding locked after completion) and re-implement
it in expo-router.

---

## 13. Open decisions / next steps

- [ ] Finalize schema in `supabase/migrations` (this doc's §4 is the sketch).
- [ ] Scaffold monorepo (pnpm + Turborepo), `apps/mobile` (Expo), `apps/web` (Next.js).
- [ ] Port `theme.jsx` → `packages/theme` and `kit.jsx` → `packages/ui` first (unblocks all screens).
- [ ] Stand up Supabase project + `.edu` auth hook + `campuses` allowlist.
- [ ] Stripe Connect account + the payment/payout Edge Functions.
- [ ] Video link source (§9): auto-generate per-session room vs. tutor-pasted URL.
- [ ] Decide analytics/observability (e.g. PostHog) — not covered here.
