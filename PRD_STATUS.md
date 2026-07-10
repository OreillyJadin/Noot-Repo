# Noot — PRD implementation status

_Snapshot 2026-07-10. Maps the product (see `prd-data-models.md` + `ARCHITECTURE.md`) to
what's actually built. Made for planning next steps — take it into a chat and ask "what
should we build next?"_

**Legend:** ✅ working & verified · 🟢 built (code + wired, not yet click-tested) ·
🟡 partial / unverified · 🔴 not built

**One-line state:** the core student journey — sign in → find a tutor → message → book →
see it in Upcoming → cancel/rate — is built and runs against the real cloud database, and
as of **2026-07-10 there is no dummy data left** — every screen reads live `@noot/core`
data (availability, stats, names all wired), and the cloud is seeded with tutors, students,
bookings, chats & reviews. The big missing pieces are **real money (Stripe)**, the
**Ambassador program**, the **Admin tools**, and **push notifications**. Money is *simulated*.

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
| One account / multiple roles, role switch | 🟢 | `user_roles` + `activeRole`; onboarding sets role. |
| Profile photo upload | 🔴 | `TODO(api)` in `t2`/`edit_personal` — no storage upload wired. |

## Profiles (student & tutor)

| Feature | Status | Notes |
|---|---|---|
| Read own profile (`getMe`) | ✅ | |
| Edit personal info / courses | 🟢 | `profile.updatePersonal`, `setCourses`. |
| Tutor profile (bio, subjects, rates, courses) | 🟢 | `updateTutorProfile`, `updateRates`, `setTutorCourses`. |
| Set weekly availability (write) | 🟢 | `profile.updateAvailability`; `edit_availability` prefills from real saved windows. |
| **Read** availability endpoint | 🟢 | `tutors.getAvailability(tutorId)` in core. |
| **Read** availability wired into UI | 🟢 | **DONE (2026-07-10):** `lib/availability.ts` maps windows → real slots; consumed by `b1`/`b3`/`edit_availability`/`tutor_calendar`. Demo `slotsFor()` deleted. |
| Tutor transcript upload for approval | 🔴 | PRD wants transcript → admin review. Not built. |

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

## Payments & money  ⚠️ all simulated

| Feature | Status | Notes |
|---|---|---|
| Charge student at booking | 🔴 | `create-payment-intent` returns a **fake** `sim_pi_…`. No real card charged. |
| Capture on completion / tutor payout | 🔴 | `complete-session` unwritten. `platform_fee` hardcoded 0, payout = full price. |
| Stripe Connect onboarding (tutors) | 🔴 | `connect-onboarding-link` unwritten. |
| Stripe webhook (payment/refund events) | 🔴 | Unwritten. **This is the largest remaining workstream.** |

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

## Ambassador program

| Feature | Status | Notes |
|---|---|---|
| Ambassador profiles, referral codes, referrals | 🔴 | Tables exist (`ambassador_profiles`, `referrals`, `referral_bonuses`) — **no API, no UI, no functions**. |
| $5 one-time referral bonus on first completed session | 🔴 | `award-referral-bonus` unwritten. |

## Admin

| Feature | Status | Notes |
|---|---|---|
| Approve / reject tutor transcripts | 🔴 | `approve-tutor` unwritten; no admin UI. Demo tutors are seeded pre-approved. |
| Suspend / ban users | 🔴 | `Users.status` exists; no admin action. |
| Referral / commission ledger visibility | 🔴 | Not built. |

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

1. **Real money (Stripe)** — biggest gap and gates real launch: `create-payment-intent`
   (real held charge), `stripe-webhook`, `complete-session` (capture + payout), Connect
   onboarding. Everything else is simulated until this lands.
2. **Close the booking loop's remaining honest gap** — **server-side booking validation**
   (scheduled_at inside an availability window, no overlap with a confirmed booking).
   _(Availability wiring, past-sessions, and tutor/student stats are all DONE.)_
3. **Admin + tutor approval** — transcript upload + `approve-tutor` so real tutors can go
   live (today they must be seeded pre-approved).
4. **Ambassador program** — entirely unbuilt; whole feature (API + functions + UI).
5. **Notifications** — push registration + reminders.
6. **Verification debt** — click-test the booking/reschedule/no-show/chat flows in the
   live app; exercise realtime chat; wire cloud SMTP for real sign-ups.
