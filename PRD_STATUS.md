# Noot — PRD implementation status

_Snapshot 2026-07-22. Maps the product (see `prd-data-models.md` + `ARCHITECTURE.md`) to
what's actually built. Made for planning next steps — take it into a chat and ask "what
should we build next?"_

**Legend:** ✅ working & verified · 🟢 built (code + wired, not yet click-tested) ·
🟡 partial / unverified · 🔴 not built

**One-line state:** the core student journey — sign in → find a tutor → message → book →
see it in Upcoming → cancel/rate — runs against the real database with **no dummy data
left**. Role-switching, the Ambassador program, and the Admin panel are built + verified.
As of **2026-07-18**: **profile photo upload** (avatars bucket), an **in-app notification
center** (triggers on new message/booking), **tutor course editing**, ratings hidden
app-wide, a transparent tutor pay breakdown, and a School-colors theme are all built +
backend-verified.

**🚩 MVP gap (updated 2026-07-22):** **Real money is now BUILT** (Stripe test mode) —
PaymentSheet charge + 17.5% fee, Connect onboarding, `complete-session` (capture → payout →
referral bonus), cancel/no-show refunds, and `payments-webhook` are all coded, deployed, and
backend-verified. **Remaining before launch:** (1) **on-device verification** of the paid
flow (needs the EAS dev build — Android build is done; iOS needs an Apple account); (2)
**Supabase transactional email** (SMTP) for real `.edu` signup/reset; (3) go-live = swap
Stripe **test** keys for **live**. Deferred (not required for a first submission): **device
push delivery** (in-app notification center exists; no Expo push send yet) and reminder/
auto-complete crons.

---

## Auth & onboarding

**Auth model (changed 2026-07-07):** sign-**up** is *verification only* — full name + campus
email → a magic link that proves the `.edu` address; the user sets a password afterward in
onboarding (`verified` → `set_password`). Sign-**in** is **email + password**. Magic link is
now used for signup verification and password reset, **not** as the day-to-day sign-in path.

| Feature | Status | Notes |
|---|---|---|
| `.edu` / campus-email gate at signup | ✅ | DB trigger rejects non-campus emails; UA seeded. Verified. |
| New user → auto-provisioned profile row | ✅ | `handle_new_user` trigger. Verified. |
| Signup verification (magic link proves `.edu`) | 🟢 | `sendSignupVerification` → `/auth-callback`. Verified locally (Mailpit). **Cloud needs SMTP** before real students receive links — see `MANUAL_SETUP.md`. |
| Password sign-in / set / reset | 🟢 | `signInWithPassword`, `setPassword`, `sendPasswordReset` (+ `signin`/`set_password`/`forgot_password` screens). Verified via `scripts/verify_password_auth.mts`. |
| Biometric launch gate + encrypted session storage | 🟢 | `AuthGate` (Face/Touch ID on cold launch) + `secureStorage`; opt-in via `enable_faceid`. Not device-tested. |
| Dev sign-in (seeded accounts, password) | ✅ | `__DEV__`-only shortcut; works on cloud. Use this to click through today. |
| One account / multiple roles, role switch | 🟢 | **DONE (2026-07-11):** `<RoleSwitcher>` on Profile persists `active_role` (guard trigger `0007`: must be a role you hold); "Viewing as" indicator on home headers; ambassador mode + tab set; "Become an ambassador/tutor" add-role. Admin is a separate gated entry, not a mode. |
| Profile photo upload | 🟢 | Public `avatars` bucket (0013) + `api.profile.uploadAvatar` + image picker wired into every "Change photo". Own avatar renders; other users' photos still show initials. |

## Profiles (student & tutor)

| Feature | Status | Notes |
|---|---|---|
| Read own profile (`getMe`) | ✅ | |
| Edit personal info / courses | 🟢 | `profile.updatePersonal`, `setCourses`. |
| Tutor profile (bio, subjects, rates, courses) | 🟢 | `updateTutorProfile`, `updateRates`, `setTutorCourses`. |
| Set weekly availability (write) | 🟢 | `profile.updateAvailability`; `edit_availability` prefills from real saved windows. |
| **Read** availability endpoint | 🟢 | `tutors.getAvailability(tutorId)` in core. |
| **Read** availability wired into UI | 🟢 | **DONE (2026-07-10):** `lib/availability.ts` maps windows → real slots; consumed by `b1`/`b3`/`edit_availability`/`tutor_calendar`. Demo `slotsFor()` deleted. |
| Tutor transcript upload for approval | 🟢 | **DONE (2026-07-11):** `t6` picks a PDF/image (`expo-document-picker`) → `api.profile.uploadTranscript` → private `transcripts` Storage bucket (`0011`, folder-scoped RLS); admin reviews via signed URL. Picker device-untested; upload path verified on cloud. |

## Tutor discovery

| Feature | Status | Notes |
|---|---|---|
| Search tutors (all / by course / by category) | ✅ | `tutors.search` (`course` + `categoryPrefixes`). Browse tabs filter by category. Only `approved` tutors shown. |
| Tutor detail | 🟢 | `tutors.getById`. |
| Save / unsave / list saved | ✅ | Verified (RLS-scoped writes). |

## Booking (the core loop)

| Feature | Status | Notes |
|---|---|---|
| Create/confirm a booking | ✅ | `confirm-booking` Edge Function, deployed to cloud. **Verified against cloud** (book → Upcoming → cancel → 100% refund). |
| See upcoming sessions | ✅ | `listUpcoming` returns real confirmed future bookings. |
| Cancel (+ refund tier math) | ✅ | `cancel-booking`; 100%-before-deadline verified. |
| Reschedule (propose/accept, 3-max rule) | 🟢 | `reschedule-booking` deployed + wired; not click-driven yet. |
| Report no-show (3-strike escalation) | 🟢 | `report-no-show` deployed + wired; not click-driven yet. |
| Booking validation vs availability/overlap | 🟡 | PRD wants scheduled_at inside an availability window + no overlap. Server doesn't enforce this yet. |
| Past / completed sessions list | 🟢 | `listPast` built + wired into `sessions.tsx` "Past" tab (real rows). |
| Auto-complete 24h after session (cron) | 🔴 | Not built. |

## Payments & money  ✅ built (Stripe TEST mode) — needs on-device verification

| Feature | Status | Notes |
|---|---|---|
| Charge student at booking (PaymentSheet) | 🟢 | `create-payment-intent` makes a real manual-capture hold (verified `pi_…` on cloud); `b4.tsx` uses native `@stripe/stripe-react-native` PaymentSheet. Charge itself needs the dev build to click-test. |
| 17.5% platform fee split | ✅ | `confirm-booking` computes fee + payout. Verified: $28 → $4.90 / $23.10. |
| Capture on completion / tutor payout | 🟢 | `complete-session` (tutor "Mark session complete" on the Past tab) captures the hold + transfers payout to the tutor's Connect acct + fires the referral bonus. Sim path verified; real capture/transfer needs a device + onboarded tutor. |
| Stripe Connect onboarding (tutors) | 🟢 | `connect-onboarding-link` + `connect-status`; tutor_profile "Payout account" opens the hosted form. (Needs Accounts v1 enabled — done.) |
| Cancel / no-show refunds | 🟢 | `cancel-booking` (tiered release/capture) + `report-no-show` (release or capture+transfer) move real money on the held PI. |
| Stripe webhook | 🟢 | `payments-webhook` (account.updated, charge.refunded) registered in Stripe + `STRIPE_WEBHOOK_SECRET` set; signature verification confirmed. |
| Go-live | 🔴 | Currently **test** keys. Swap for `sk_live`/`pk_live` (+ business verification) when ready to take real money. |

## Messaging

| Feature | Status | Notes |
|---|---|---|
| Conversations + send/read messages | 🟢 | `chat.getOrCreateConversation/listMessages/sendMessage/listConversations`. |
| Counterparty display names | 🟢 | `resolve-participants` (now returns year/major, **deployed to cloud 2026-07-10**) + `lib/useCounterpart` resolve real names everywhere "Lindsay Thomas" was hardcoded (tb1/tb2/xtc/xns/xtr/c1/c3/chat_tutor). |
| Realtime message updates | 🟡 | `chat.subscribe` implemented but **never exercised** — unverified. |
| Attachments (images/files) | 🔴 | No table/upload; `TODO(api)` in `chat`. |

## Reviews & ratings

| Feature | Status | Notes |
|---|---|---|
| Submit rating after a session | 🟢 | `submit-rating` deployed (double-blind visibility). Wired in `/c1`. |
| Show reviews on a tutor | 🟢 | `reviews.listForTutor`. |

## Ambassador program  (built 2026-07-11)

| Feature | Status | Notes |
|---|---|---|
| Invite codes for everyone (0040) | 🟢 | `my_invite_code()` generates a unique `NOOT-XXXXXX` per user server-side; ambassadors reuse theirs. |
| Invite screen | 🟢 | `/invite` (everyone) and `ambassador_referrals` — code, Noot credit, people invited; ambassadors also see goals + cash-out. |
| Invite attribution | 🟢 | Code typed on the sign-up screen, kept on the device, claimed after first sign-in (`claim_invite`): once, before any booking, only an older account's code (no loops). |
| Noot credit ($5 per invitee's completed session) | 🟢 | `award-referral-bonus` → `award_invite_rewards`, fired by `complete-session` (also on retry). Credit auto-applies at checkout; returned on cancel/refund; reversed on full refund or dispute. |
| Ambassador goals + cash-out | 🟢 | Team approval (`ambassador_approvals`) unlocks milestone bonuses and cash-out of credit ≥ 7 days old ($10 min); paid by hand. |

## Admin  (built 2026-07-11)

Gated **Noot Admin** entry on Profile (only `roles.includes('admin')`) → `admin_home` → four sections.
Every admin write is an Edge Function that re-verifies `is_admin` server-side.

| Feature | Status | Notes |
|---|---|---|
| Approve / reject tutor transcripts | 🟢 | `admin_tutors` queue + `approve-tutor` fn. Migration `0009` closes the tutor **self-approve** RLS gap (approval fields service-role-only). Verified on cloud. |
| Suspend / ban / reactivate users | 🟢 | `admin_users` + `admin-set-user-status` fn (sets `status` + real GoTrue ban/unban). `0010` guards self-writes to `status`. Verified on cloud. |
| Booking oversight + dispute flag/resolve | 🟢 | `admin_bookings` + `resolve-dispute` fn; `0010` adds `bookings.dispute_status/reason/resolution`. Verified on cloud. |
| Review moderation | 🟢 | `admin_reviews` + `moderate-review` fn (approve/reject + recompute `rating_avg`; sole writer of `reviews.approval_status`). Verified on cloud. |

## Notifications

| Feature | Status | Notes |
|---|---|---|
| Push token registration | 🔴 | `push_tokens` table exists; no register API. |
| Booking-confirmed / reminder / new-message pushes | 🔴 | `send-reminders` cron unwritten. |

## Tutor dashboard extras

| Feature | Status | Notes |
|---|---|---|
| Earnings / payout figures | 🟢 | **DONE (2026-07-10):** `api.tutorStats()` (earnedThisWeek/earnedTotal from completed bookings) in `tutor_home`/`tutor_profile`/`c4`. Reflects *simulated* money until real Stripe. |
| Teaching stats (sessions, avg rating, cancel rate) | 🟢 | **DONE (2026-07-10):** `api.tutorStats()` (sessionsTaught, hoursTaught, avgRating, cancelledCount) wired into `tutor_home`/`tutor_profile`. |
| Student study stats (sessions/hours/saved) | 🟢 | **DONE (2026-07-10):** `api.studentStats()` + `listSaved` count in `home`/`profile`. Streak/monthly-goal removed (no data model → honest zero-states). |

---

## Suggested next-step buckets (for the planning chat)

1. **Real money (Stripe)** — the biggest remaining gap and the gate to launch:
   `create-payment-intent` (real held charge), `stripe-webhook`, `complete-session`
   (capture + payout), Connect onboarding. Everything money-related is simulated until this
   lands — and it also unblocks the built-but-untriggered `award-referral-bonus` (fires on
   `complete-session`) and the auto-complete cron.
2. **Close the booking loop's remaining honest gap** — **server-side booking validation**
   (scheduled_at inside an availability window, no overlap with a confirmed booking).
3. **Notifications** — push registration + reminders (`send-reminders` cron).
4. **Verification debt** — click-test the booking/reschedule/no-show/chat/**role-switch/
   ambassador/admin** flows in a live browser or device build (this session verified them
   via typecheck + web bundle + backend smoke scripts, not manual click-through); exercise
   realtime chat; wire cloud SMTP for real `.edu` sign-ups.
5. **Anti-abuse pass** — referral attribution can be spoofed via signup metadata (needs a
   real paid session to pay out; not a security hole but a gaming vector); enforce
   `users.status` at the RLS level (today a ban blocks new tokens via GoTrue but an active
   session lingers ~1h). See the security notes in `notes/2026-07-10-2110-*.md`.

_Done this stretch: dummy-data removal, cloud seed, role-switching, ambassador program,
admin panel (tutor approval + transcript upload, user mgmt, disputes, review moderation)._
