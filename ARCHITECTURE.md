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

**Authoritative source: `prd-data-models.md`.** This section summarizes it. RLS on every table.

### Roles

Four roles. **A user can hold more than one role and switch between them from their Profile**
(resolved decision — the handoff's mode switch, not the PRD's single-role). A user carries a set of
`roles` plus an `active_role`; profile tables exist only for the roles that need extra data.

| Role | Profile table | Key behavior | Signup gate |
|---|---|---|---|
| Student | — | Books sessions with tutors | Active on `.edu` verify |
| Tutor | `TutorProfiles` | Uploads transcript; **admin-approved** before bookable | `.edu` verify → admin approval |
| Ambassador | `AmbassadorProfiles` | Invites like everyone ($5 Noot credit per invitee who completes a session), plus **milestone bonuses** (`AmbassadorMilestones`) and **cash-out** of credit | Active on `.edu` verify |
| Admin | — | noot team — approves tutors, moderates reviews, manages accounts | Internal |

A typical account is student + tutor; ambassador/admin are usually held on their own.

### Tables

```
Users                         base identity (Supabase Auth backs id + email)
  id · email(.edu, unique) · first_name · last_name
  status(active|suspended|banned) · created_at · updated_at
user_roles                    a user may hold several (student/tutor/ambassador/admin)
  user_id · role · PRIMARY KEY(user_id, role)
  (Users.active_role tracks the role currently switched-to in Profile)

TutorProfiles                 1:1 with Users where role=tutor
  id · user_id(unique) · bio · subjects · hourly_rate · transcript_url
  approval_status(pending|approved|rejected) · reviewed_by(admin) · reviewed_at
  stripe_connect_account_id · rating_avg(denormalized) · created_at · updated_at
  → only approved tutors are visible/bookable

AmbassadorProfiles            1:1 with Users where role=ambassador
  id · user_id(unique) · referral_code(unique) · stripe_connect_account_id
  total_referrals · total_earned · created_at · updated_at

InviteCodes                   one per user (0040); generated server-side, never client-chosen
  user_id(pk) · code(unique) · created_at

Referrals                     who invited whom (ambassador_id = the inviter, any user since 0040)
  id · ambassador_id · referred_user_id(unique) · referred_role(student|tutor)
  referral_code_used · created_at

CreditLedger                  Noot credit (0040). Append-only; balance = sum(amount_cents)
  id · user_id · amount_cents(±) · kind(invite_reward|milestone_bonus|booking_spend|
  booking_return|cashout|reward_reversal|adjustment) · referral_id · booking_id · payment_intent_id
  milestone · cashout_id · created_at      — partial unique indexes make each event once-only

AmbassadorMilestones          threshold(pk) · bonus_cents   (placeholder amounts; team-editable)
AmbassadorApprovals           user_id(pk) · approved_at · approved_by — team-written; unlocks
                              milestone bonuses + cash-out (credit ≥ 7 days old, $10 min)
CreditCashouts                id · user_id · amount_cents(≥1000) · status(pending|paid|rejected)
RedeemedInviteEmails          email_hash(pk) — one invite per email, survives account deletion

ReferralBonuses               LEGACY (cash bonuses before 0040); no longer written

Bookings                      the unit of work
  id · student_id · tutor_id · subject · scheduled_at · duration_minutes
  price · platform_fee · tutor_payout_amount
  session_type(video|in_person) · meeting_link · location  ← external link (§9)
  status(pending|confirmed|completed|cancelled)
  cancellation_deadline(scheduled_at − 24h) · cancelled_at
  refund_status(not_applicable|refunded|not_refunded)
  stripe_payment_intent_id(charged upfront) · created_at · updated_at

Conversations                 pre-booking messaging (per student↔tutor)
  id · student_id · tutor_id · created_at
Messages
  id · conversation_id · sender_id · content · read_at · created_at

Reviews                       ADMIN-MODERATED; hidden from everyone until approved
  id · booking_id · reviewer_id · subject_user_id(the person being rated)
  rating(1-5) · comment
  approval_status(pending|approved|rejected) · reviewed_by(admin) · reviewed_at
  created_at
  → visible to no one (not even the subject) until approval_status=approved;
    once approved it attaches to subject_user_id's profile and updates rating_avg

TutorAvailability             recurring weekly windows
  id · tutor_id · day_of_week(0-6) · start_time · end_time · created_at
availability_overrides        one-off open/close per date (calendar tap-to-toggle, TC)
  id · tutor_id · date · start_time · end_time · is_open · created_at

PushTokens                    device registration for notifications
  id · user_id · token · platform(ios|android) · created_at
```

**RLS highlights:** users read/write only their own row; bookings visible only to their student or
tutor; conversation/message rows only to participants; only `approved` tutors are student-visible;
**reviews are readable only when `approval_status=approved`** (pending/rejected visible to admins
only); credit is written only by SECURITY DEFINER functions — clients read their own
ledger rows and nothing else; one `invite_reward` per referral is a unique index.

**Backend rules (Edge Functions, §5):** booking must fall inside a `TutorAvailability` window and
not overlap a confirmed booking; on `completed`, `award_invite_rewards` credits $5 to whoever
invited the student and the tutor (once per invitee, ever; never for a session with your own
inviter) plus any milestone an approved ambassador has reached.

### Resolved decisions (PRD ↔ handoff)

Where the PRD and the design handoff disagreed, these are the decided outcomes:

| Topic | Decision |
|---|---|
| Roles per account | **Multiple roles per account**, switched from Profile (`user_roles` + `active_role`) |
| Ratings/reviews | **Admin-moderated** — hidden from everyone until an admin approves, then attached to the rated user |
| Cancellation refund | **Binary 24h** — full refund before `scheduled_at − 24h`, none after |
| Availability | **Weekly windows + one-off overrides** (`TutorAvailability` + `availability_overrides`) |
| Ambassador role | **Included** (invites + milestone bonuses + credit cash-out) |

---

## 5. Edge Functions (server-only logic)

Everything the client can't be trusted to do. Deno, in `supabase/functions/`.

| Function | Trigger | Responsibility |
|---|---|---|
| `create-payment-intent` | B4 pay | Create Stripe PaymentIntent, **manual capture** (held), `application_fee_amount` (Free/$0 at launch). |
| `stripe-webhook` | Stripe | `payment_intent.succeeded` → confirm booking; `account.updated` → tutor Connect onboarding status; refunds/transfers. |
| `confirm-booking` | after payment | Create `bookings` row (+ series for weekly), drop B3 intro message into the thread (B5), fire TB1 to tutor. |
| `connect-onboarding-link` | T9 payout setup | Create Stripe Connect account + hosted onboarding link. |
| `complete-session` | C-flow / cron | Capture held payment, transfer payout to tutor; on success, run the referral-bonus check. |
| `submit-review` | after session | Store review as `approval_status=pending` — hidden from everyone until moderated. |
| `moderate-review` | admin | Admin approves/rejects a review; on approve, attach to the subject user + update `rating_avg`. |
| `award-referral-bonus` | on `complete-session` | Service-role only. Calls `award_invite_rewards`: $5 Noot credit to the inviter of the booking's student/tutor (once per invitee) + ambassador milestones. |
| `cancel-booking` | cancel | **Binary 24h**: cancel before `scheduled_at − 24h` → full refund; after → none. Set `refund_status`. |
| `approve-tutor` | admin | Set `TutorProfiles.approval_status`; only approved tutors become bookable. |
| `send-reminders` (scheduled) | `pg_cron` | 24h + 1h reminders (location / video link on the 1h). |

Client never touches the Stripe secret key or writes `bookings`/`payouts`/review approval directly.

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
  account (payout within ~2 business days). Tutor Connect onboarding is part of tutor setup.
- **Reviews (admin-moderated):** stored `pending` and hidden from everyone until an admin approves,
  then attached to the rated user. Enforced in `submit-review` / `moderate-review` + RLS, never client-side.
- **Refunds (binary 24h):** full refund if cancelled before `scheduled_at − 24h`, none after —
  server rule in §5 `cancel-booking`; the screens only surface the state.
- **Noot credit (0040, replaces the cash referral bonus):** the inviter gets $5 credit when
  the invitee completes a session. Credit comes off the next booking automatically
  (`create-payment-intent`); the tutor's payout is still on the full price, so noot absorbs
  it; the card is always charged at least $1. Spent under a per-user lock in
  `confirm-booking`, returned pro rata on cancel and in full on a tutor no-show. Refunds in
  Stripe (`payments-webhook`) top the student's returned credit up to the refunded share; a
  full refund or a new dispute takes back the $5 the session earned (either side's inviter,
  out of unspent credit only) and stops it counting toward goals; a lost dispute returns the
  student's credit. A friend's code is typed at sign-up, kept on the device, and claimed by
  the new account after it first signs in (`claim_invite`) — never read from the sign-up
  request, which anyone can make for any address. Only an older account's code can be
  claimed, so invites point back in time and can't loop. One booking per PaymentIntent
  (unique index). Ambassadors
  also earn milestone bonuses and can request a cash-out (paid by the team by hand for now).
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

- [x] Scaffold monorepo (pnpm + Turborepo), `apps/mobile` (Expo), `apps/web` (Next.js).
- [x] Port `theme.jsx` → `packages/theme`; starter `kit.jsx` → `packages/ui`.
- [x] Resolve the PRD ↔ handoff conflicts (§4) — see "Resolved decisions".
- [ ] Finalize schema in `supabase/migrations/0001_init.sql` from §4 / `prd-data-models.md`.
- [ ] Port remaining `kit.jsx` primitives + screens into `packages/ui` / `apps/mobile`.
- [ ] Stand up Supabase project + `.edu` auth hook + `campuses` allowlist.
- [ ] Stripe Connect account + the payment/payout Edge Functions (+ referral-bonus function).
- [ ] Video link source (§9): auto-generate per-session room vs. tutor-pasted URL.
- [ ] Decide analytics/observability (e.g. PostHog) — not covered here.
