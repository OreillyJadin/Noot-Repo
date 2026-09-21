# App Review round 2 — tickets

Read `APP_REVIEW_START_HERE.md` first. It has the rules, the verification loop, and Apple's
message. Work one ticket at a time, in plan mode for anything touching money, RLS, auth, or
deletion.

Sources: a read-only audit of the Supabase project `Noot` (2026-09-10), cross-checked against
`HANDOFF_2026-08-11.md`, `ASC_SUBMISSION_CHECKLIST.md`, `PICKUP_HERE.md`, and `TEAM_UPDATE_2026-08-23.md`.

**Client code has since been verified (2026-09-10).** The `Verified:` notes below replace the
original DB-only guesses. Three problems the DB audit couldn't see were added as T11–T13.

Status: `[ ]` todo · `[~]` in progress · `[x]` done and verified

**Deployed to production 2026-09-17.** Migrations `0029`-`0032` were applied by the Supabase
GitHub integration on push to `main` (verified: `blocked_terms` has 18 rows, all 6 filter
triggers exist, `users.terms_accepted_at` and `bookings.payout_failed_at` exist, and
`contains_blocked_term()` matches a slur while leaving "Scunthorpe" alone). The five changed
Edge Functions were deployed with the CLI and each returns its own `Not authenticated` JSON,
confirming the `_shared/booking.ts` bundle imports cleanly.

**Breaking change to note:** `create-payment-intent` now takes
`{tutorId, courseCode, durationMinutes, scheduledAt}` and ignores `amountCents`, so **build 4
can no longer create a booking.** That was the point of T5 — the old path was a cash-out hole —
but it means the review build and the recording must be build 5 or later. Rollback if ever
needed is `git revert` plus a redeploy of the five functions.

---

## T0 — External blockers (Jadin; no code) — these gate everything

Each of these was open in the last docs. Confirm the current state first.

- [x] **The marketing site is live** — on **`trynoot.com`**, not `noot.app` (2026-09-17).
      `https://trynoot.com/` and `https://trynoot.com/privacy` both return 200 and are public.
      **`/terms` is a 404** — there is no standalone terms page, so Terms and Privacy are one
      combined document at `/privacy`, and the app links both rows there
      (`apps/mobile/lib/legal.ts`). The live site is *not* served from `apps/web`.
- [x] **SMTP configured** (2026-09-17). Resend via `smtp.resend.com`, sending as
      `support@trynoot.com`, confirmed sending. Auth templates and URL config are now code —
      `supabase/templates/*.html` + `scripts/push_auth_templates.mts`. Before this, `site_url`
      was `http://localhost:3000`, `uri_allow_list` was **empty** (so `noot://` deep links were
      silently rewritten to localhost), and the Confirm-sign-up body was the literal text
      "Testing Testing Test".
- [ ] **Stripe live mode**, done together with T10 — never before it.
- [ ] **A fresh SDK 57 production build → TestFlight.** `PICKUP_HERE.md`: the SDK 54→57 upgrade
      landed after the review build was prepared, and Expo Go can't run PaymentSheet. Whatever
      build Apple has now, the fixed build and the recording both have to come from a new EAS
      production build.
- [ ] **Device pass** with the script at the bottom of this file, by at least two people.

---

## Blockers — code

### T1 — The reviewer's deletion test hits a 409 `[ ]`
**Found:** `delete-account` refuses when a `pending` or `confirmed` booking exists. The ASC checklist
asks for the reviewer's student account to *have* an upcoming booking, so those two collide.
**Simplest fix (no code):** Add a fourth demo account, "Deletion test", with no live bookings, and
point the reviewer to it (already in `APP_REVIEW_REPLY_DRAFT.md`).

**Verified — one code fix is needed anyway.** `delete-account/index.ts:57-68` returns a good 409
body, but `packages/core/src/api/index.ts:375` (`invokeFn`) rethrows the raw `FunctionsHttpError`,
whose `.message` is the generic "Edge Function returned a non-2xx status code". `lib/errText.ts:9`
passes that through to `profile.tsx:178`, so **the reviewer never sees the 409 reason.** `invokeFn`
must read the response body — this fixes Edge Function error copy app-wide.
**Better UX, later:** a "Cancel these and delete" flow — void each held PI, notify the other
party, then delete.
**Done when:**
- [x] The 409 reason now reaches the user — see T13, fixed 2026-09-10.
- [ ] On the device build, the deletion-test account deletes cleanly. **← needs a device**
- [ ] Signing in again fails. **← needs a device**

### T3 — Block and report reachable in the UI; block applied to search and booking `[ ]`
**Found:** `user_blocks` and `content_reports` exist. `messages_insert` enforces blocks. There are
0 rows in `user_blocks`, so blocking has never been exercised.

**Verified:** the UI entry points *do* exist — `apps/mobile/lib/moderation.tsx` (`reportMessage`
:33, `reportUser` :46, `blockUser` :64), reachable from the chat header (`chat.tsx:206`,
`chat_tutor.tsx:213`) and by long-pressing a received bubble (`chat.tsx:308`). A blocked-users
list is at `blocked_users.tsx`, linked from `profile.tsx:269`. Remaining real gaps:
- Search filtering is **one-directional and client-side** (`packages/core/src/api/index.ts:706-711`
  filters only people *I* blocked; RLS makes the reverse unreadable). Needs to move server-side
  onto the symmetric `is_blocked_between()` (`0028_reports_and_blocks.sql:76`).
- Booking has **no block check at all** (`create-payment-intent` has none; `confirm-booking:27`
  runs as service role and its opening-message insert at `:107` bypasses `messages_insert`).
- **Reviews have no report path.** `target_kind = 'review'` exists (`0028:44`) but `reportReview`
  exists nowhere. Confirmed still missing 2026-09-21 — but no claim in the reply depends on it,
  and ratings are not displayed to users, so this is not review-blocking.
- Report-a-message has no visual affordance — long-press only. A reviewer has to guess. The
  reply spells out the long-press, so it is discoverable from the notes; still worth an
  affordance before launch.
- ~~`tutor_profile.tsx` has no "Blocked users" row~~ **Fixed 2026-09-21** — and it was worse
  than recorded: the tutor profile was missing **Blocked users, Privacy Policy AND Terms of
  Service**. All three are claimed in the reply as reachable from Profile, and Apple asks for
  credentials for *each account type*, so a reviewer signed in as the tutor would have found
  three false statements. All three rows added, mirroring the student profile.

**Re-audited 2026-09-21 — the claim-critical half of this ticket is already done.** Blocking
is symmetric and enforced server-side for both messaging (`messages_insert`) and booking
(`resolveBooking` reads `user_blocks` in both directions, `_shared/booking.ts:127`), which is
exactly what the reply claims. What remains is search *visibility*: `api.tutors.search()`
still filters client-side and one-directionally (`.eq('blocker_id', meId)`), so someone who
blocked you still appears in your results — though the booking itself is refused. The reply
does not claim they disappear from search, so this is a correctness/UX gap, not a false claim.
**Fix:**
- Confirm the Report (message, user) and Block entry points exist on screen.
- Exclude blocked pairs in `api.tutors.search()` (in core, so every caller inherits it, like the
  self-exclusion and `deleted_at` filters).
- Reject blocked pairs in booking creation on the server.

**Done when:**
- [ ] `verify_blocks.mts` passes in both directions for message, search, and booking.
- [ ] On device: block a tutor, and they disappear from search.

### T4 — Server-side objectionable-content filter `[x]`
**Fix:** A word/slur list checked in `send_message_with_attachments` (or a BEFORE INSERT trigger on
`messages`) that rejects with a friendly error. Keep the list in one place. Apply the same filter
to tutor bios and review comments.
**Done (2026-09-10):** migration `0029_content_filter.sql`. A `blocked_terms` table (one
place, admin-managed, not readable by users), `contains_blocked_term()` matching
case-insensitively on **word boundaries** (substring matching would reject innocent words),
and BEFORE INSERT/UPDATE triggers on `messages`, `tutor_profiles.bio` and `reviews.comment`.
Triggers rather than RPC-level checks on purpose: `send_message_with_attachments` is one
writer, but `confirm-booking` inserts its opening message as **service role** and would
have bypassed anything RLS-based.
- [x] `scripts/verify_filter.mts` — 11/11: normal message passes (including innocent
      substring matches), offensive one rejected via `@noot/core`, and rejected again for
      a direct client insert **and** a service-role insert. Bios and the list's own
      visibility covered.
- [ ] On device: the error shows in the chat, not a spinner. **← needs a device**

### T5 — The client controls the payment amount `[x]` (critical, business)
**Found:** `create-payment-intent` takes `amountCents` from the request body and never looks up
the tutor's rate. Also check whether `confirm-booking` takes `price` from the client.

**Verified — worse than described. This is a working cash-out primitive, not just tampering.**
- `create-payment-intent/index.ts:28` trusts `amountCents`; the body has no `tutorId` at all, so
  there is no check of approval, `deleted_at`, `stripe_charges_enabled`, or slot availability.
- `confirm-booking/index.ts:54,79` trusts `price` (dollars) and derives the 17.5% fee from it
  (`:67-69`, the only definition of `FEE_RATE`). It **never** calls `paymentIntents.retrieve`.
- `complete-session/index.ts:66-75` then transfers `tutor_payout_amount` out of the platform
  balance. `price: 500` against a $1 hold yields a real $412.50 transfer.
- Both numbers originate client-side at `apps/mobile/app/b4.tsx:90-92`, from a UI array element
  (`tutor.courses[i][2]`, mapped in `apps/mobile/lib/data.ts:87-89`).
- `cancel-booking:96-97` also recomputes its partial capture from the stored client `price`.
- `sessionType` is inferred from a display string (`b4.tsx:118` `location.startsWith('Online')`).
**Fix:**
- The function takes `{ tutorId, courseCode, durationMinutes, scheduledAt }`.
- On the server, check the tutor is approved, not deleted, not blocked, has
  `stripe_charges_enabled`, and has the slot open.
- Compute the amount from `tutor_courses.hourly_rate`.
- `confirm-booking` must verify the PI amount matches the recomputed price.

**Done (2026-09-10):** new `supabase/functions/_shared/booking.ts` is the single price
authority — `resolveBooking()` derives price from `tutor_courses.hourly_rate` and asserts
approved / not-deleted / `stripe_charges_enabled` / not-blocked / future / inside the
6-day horizon / no double-booking. `create-payment-intent` no longer takes `amountCents`;
`confirm-booking` no longer takes `price`, retrieves the PaymentIntent and rejects unless
amount, owner, tutor, course and `requires_capture` status all match. `FEE_RATE` lives in
one place. Client: `createPaymentIntent(input)` + `ConfirmBookingInput` lost their money
fields (`packages/core/src/api/index.ts`), `b4.tsx` sends only what identifies the session,
and `sessionType` is now explicit rather than sniffed from a display string.
- [x] `scripts/verify_pricing.mts` — **22/22 against real Stripe test mode**, including
      `price: 99999` against a $34 hold being ignored, a hold reused for a pricier course
      being refused, hold reuse (409), and another user's hold (403).
- [x] Both functions are deployed to cloud with the version bumped (2026-09-17).

### T8 — Review demo data `[~]` (worse than first described)

**Re-audited 2026-09-18. The seeded data had rotted three ways at once**, and one of them
was turned into a hard failure by the T18 guard deployed on 2026-09-17:

1. **Every seeded booking was in the past** (latest `2026-09-11`). The reviewer's Upcoming
   tab was empty, while `ASC_SUBMISSION_CHECKLIST.md` asks for the student account to have
   an upcoming session.
2. **Every demo tutor's `stripe_connect_account_id` was a fake string** (`acct_demo_tutor1`,
   `acct_demo_tutorreview`, …). Stripe returns `account_invalid` for all of them, but
   `tutor_profiles.stripe_charges_enabled` said `true`, so `resolveBooking` let the booking
   through. A reviewer could book and have a real hold placed on their card, and then
   `complete-session:53` would enter its Stripe branch and `assertPayoutReady` (T18) would
   refuse: *"This payout account is no longer valid."* **The session could never be
   completed.** The existing seeded rows were safe only because their
   `stripe_payment_intent_id` is null, which skips the Stripe branch entirely.
3. **Every row was `session_type = 'video'`** with a `meet.example.com` link — but T14
   removed video sessions, so they render as "Online" with no way to meet. That is the exact
   complaint Apple raised.

**Fixed by `supabase/seed_app_review.mjs`** (2026-09-18) — idempotent, credential-free,
dry-run by default, and dates relative to run time so re-running before a submission
refreshes them. It derives every price from `tutor_courses.hourly_rate` exactly as
`resolveBooking()` does, so demo prices cannot disagree with server-computed ones, and it
repoints the demo tutors at `acct_1TwADu1nmgWvUthV` (the one working sandbox Connect
account). All six planned bookings were validated against production read-only: every
account and course pair resolves and the derived prices match.

**Done when:**
- [x] A repeatable seed script exists and its plan is validated against production.
- [ ] `node supabase/seed_app_review.mjs --apply` has been run against the cloud project.
      ← **needs Jadin** (the session was blocked from reading the prod service_role key)
- [ ] A deletion-test account with no live bookings exists (T1) — still not created.

**Original ticket:**
**Found:**
- One `watchmenventures.com` tutor profile has `stripe_charges_enabled = false`, and it's the only
  tutor for EC 470 / "CS100".
- ST 260 is the only course with 2 bookable tutors.
- The `crimson.ua.edu` accounts are the seeded demo set (sara, devon, …), with the password
  `password123` written in the repo, **on production**.

**Verified against production 2026-09-10 (read-only) — largely already resolved.** Five
remote-only migrations have been applied that this ticket predates:
`add_watchmenventures_campus_domain`, `wipe_crimson_test_seed`, `seed_app_review_accounts`,
`seed_app_review_activity_data`, `seed_moderation_queue_sample`. The repo-published set
(sara/devon/maya/alex/nina) is **gone**. What remains on `crimson.ua.edu` is a different,
purpose-made set — `student1@`, `student2@`, `tutor1-3@` — created by those migrations;
their passwords aren't in the repo and aren't known to this session, so **confirm they
aren't `password123`**. Current production counts: 9 `watchmenventures.com` users, 5
`crimson.ua.edu`, 7 bookings, 2 reports, 0 blocks, 0 deleted users, 5 Connect accounts and
2 Stripe customers (all test-mode → T10 is still fully live as a risk).

**Those five migrations also block `git push`** — see T16.

**Fix:** A local-only script that resets the review accounts to the state the ASC checklist
wants:
- The student has one upcoming booking (more than 24h out), one past booking, and a chat thread
  with an attachment.
- The tutor is approved, has availability over the next 14 days, and is onboarded to Stripe
  Connect **in live mode** (see T10).
- The deletion-test account has nothing live.

**Decide (§3h):** delete or re-password the `crimson.ua.edu` seed accounts before real students
arrive. A published password on a production tutor account with a payout destination isn't
acceptable after launch.

### T9 — Terms accepted at sign-up `[x]`
**Verified:** no checkbox and no column today (zero `agree`/`checkbox` hits in `signup.tsx`,
`set_password.tsx`, `role.tsx`; no `terms_accepted_at` in any migration). But `/terms` is
**already adequate** — `apps/web/app/terms/page.tsx:65-68` has the no-tolerance language, the
report/block claims, and the 24-hour commitment. Only the app-side gate is missing.

Onboarding chain is `signup.tsx` → `verified.tsx` → `set_password.tsx` → `enable_faceid.tsx` →
`role.tsx`.

**Fix:** A required checkbox during onboarding (on `set_password`, before `/enable_faceid`)
linking to the published terms. Store `terms_accepted_at` and `terms_version`.
**Done (2026-09-10):** migration `0030_terms_acceptance.sql` adds
`users.terms_accepted_at` / `terms_version` (nullable on purpose — back-filling existing
accounts would be a false record of consent). `api.profile.acceptTerms(version)` in
`@noot/core`; a required checkbox on `set_password.tsx` linking to both legal pages, with
Continue disabled until it's ticked, shown in onboarding only (not password reset).
`TERMS_VERSION` lives in `apps/mobile/lib/legal.ts`.
**Updated 2026-09-17:** both links now point at `https://trynoot.com/privacy` — the combined
Terms and Privacy document — since `trynoot.com/terms` doesn't exist.
- [x] `scripts/verify_terms.mts` — 6/6, including that `TERMS_VERSION` matches the
      `updated` date on the published terms page, that the page still carries the
      zero-tolerance / report / block / 24-hour language the reply claims, and that a user
      can't forge acceptance on someone else's row.
- [ ] Onboarding can't be completed without accepting, verified on device. **← needs a device**

### T10 — Stripe test → live cutover `[ ]` (do together with T0's live keys)

**Investigated 2026-09-18 — the keys are a SANDBOX, not test mode on a live account.**
`.noot-secrets.local.env` and the production project both point at:

```
acct_1Tq3Mg1nmgmdwQqI   "Watchmen  sandbox"   jadin.oreilly@watchmenventures.com
business url: https://accessible.stripe.com   (Stripe's placeholder default)
```

Evidence it is the same account in production: the Connect accounts created by the prod
`connect-onboarding-link` (`acct_1TxbPL…`) are visible under these local sandbox keys.

**A Stripe Sandbox cannot be promoted to live.** The cutover is not "flip a switch" — it
needs a separate, activated business account, new `sk_live_`/`pk_live_` keys, a new
`STRIPE_WEBHOOK_SECRET`, and re-onboarding every tutor's Connect account, because Connect
ids do not cross accounts. That is also what makes `acct_demo_*` and the stale ids in T18's
notes dangerous.

**Also found:** Jadin's own Connect onboarding was never finished — five accounts exist
(`acct_1TxbPJ…` through `acct_1TxbPL…`), all `details_submitted: false`, created seconds
apart. `connect-onboarding-link` appears to mint a fresh account per tap instead of reusing
an incomplete one. Worth a ticket of its own.

**CUTOVER DONE 2026-09-19.** The live account was located and is fully activated:

```
acct_1Tq3MW1NCXpBpEKP   "Noot tutoring"   jadin.oreilly@watchmenventures.com
charges ✓  payouts ✓  details_submitted ✓  card_payments active  transfers active
requirements: nothing due
```

Note it is a *different* account from the sandbox (`acct_1Tq3Mg…`), not the same account in
another mode — so nothing carries across.

What was changed:

| | |
| --- | --- |
| `.noot-secrets.local.env` | live keys added under **`_LIVE`** names, gitignored, `chmod 600`. `STRIPE_SECRET_KEY` intentionally still points at the **sandbox** — `verify_pricing.mts` / `verify_payout_guards.mts` create real PaymentIntents against it, and that is what stops a local test run charging a real card. |
| Live webhook | created `we_1UHR3Y1NCXpBpEKPxsvLzGd4` → `payments-webhook`, events `account.updated`, `charge.refunded`, `payment_intent.succeeded`. Signing secret stored as `STRIPE_WEBHOOK_SECRET_LIVE`. The Sync Engine's `stripe-webhook` does **not** read `STRIPE_WEBHOOK_SECRET`, so there is no collision (verified against the deployed source). |
| Prod Supabase secrets | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` → live values. |
| `apps/mobile/eas.json` | **production profile only** → `pk_live_…`. development and preview stay on `pk_test_`. A publishable key is public by design, so it is fine in git. |
| Database | every `stripe_connect_account_id` nulled and `stripe_charges_enabled` set false (5 tutors); every `stripe_customer_id` nulled (2 users). All were sandbox ids, invalid under live keys. |
| Functions | all 8 Stripe-touching functions redeployed so they pick up the new secrets. |

Verified: a signed-probe of `payments-webhook` returns a *signature mismatch* rather than
"Webhook not configured", which only happens when both secrets are present and verification
is actually running.

**STILL OPEN — Stripe is not usable end-to-end yet:**
- [ ] **Zero live Connect accounts exist.** Until at least the review tutor onboards,
      `assertPayoutReady` refuses every completion. **Jadin must tap Profile → Payout account
      → Set up payouts in a production build and finish Stripe's live onboarding** (real
      identity + bank details). Verify with
      `curl https://api.stripe.com/v1/accounts?limit=5 -u "$STRIPE_SECRET_KEY_LIVE:"` —
      a new account appearing there also proves prod is using the live key.
- [ ] `DEMO_CONNECT_ACCOUNT=acct_… node supabase/seed_app_review.mjs --apply` once a live
      account exists, to give the demo tutors a working payout destination.
- [ ] **Real money is now live.** Any booking on a production build charges a real card.

**Original ticket:**
**Found:** 2 users have a `stripe_customer_id`, and 5 tutor profiles have a
`stripe_connect_account_id`, all created under test keys. With live keys:
- `create-payment-intent` reuses the stored customer and fails with "No such customer". That
  likely includes the reviewer's demo student.
- `complete-session` transfers to test `acct_…` IDs and fails.
- The `stripe_charges_enabled` / `stripe_payouts_enabled` flags are stale.

**Verified:** there is **no `resource_missing` handling anywhere in the repo** (grep across all
`.ts/.tsx/.mjs/.mts` is empty). Worse, `complete-session` captures at `:62` and *then* transfers at
`:66` — after the key swap the capture succeeds and the transfer throws, leaving money captured, no
payout, the booking still `confirmed`, and nothing flagged. It also reads
`stripe_connect_account_id` (`:49-54`) but never checks `charges_enabled`/`payouts_enabled`, which
`connect-status/index.ts:27` already knows how to fetch. Note `scripts/check_release.mjs:75` only
*warns* on `pk_test_` in production — don't lean on it.

**Fix:** A cutover migration or script that nulls those IDs and flags, run in the same step as the
key swap. Or, more robustly, make both functions recreate the customer or account when Stripe
returns `resource_missing`. Then re-onboard the demo tutor in live mode.
**Done when:**
- [ ] After the key swap, the demo student completes PaymentSheet on the TestFlight build.
- [ ] The demo tutor's Connect status reads enabled.

---

## Should fix (not review-blocking)

### T6 — Holds expire before later sessions `[~]` (option (a) shipped)
**Found:** Payment is a manual-capture hold at booking. The calendar offers **14 days** ahead, and
`confirm-booking` supports **weekly repeat series**. Card authorizations typically lapse after
about 7 days, so capture fails and the tutor goes unpaid.
**Options:**
- (a) Simplest: cap booking at 6 days ahead and disable repeat for launch.
- (b) Better: save the payment method at booking (the Stripe Customer already exists). A pg_cron
  job creates the hold about 24h before each session, and the booking is flagged if that fails.

**Recommendation:** (a) now, (b) once reminders and auto-complete crons are built.

**Option (a) done (2026-09-10):** repeat is gone (T11) and the booking window is capped at
6 days — `BOOKABLE_DAYS` in `apps/mobile/lib/data.ts` for the picker, and
`BOOKING_HORIZON_DAYS` in `supabase/functions/_shared/booking.ts` rejects anything further
out server-side (verify_pricing step 10). No hold can now outlive its authorization.
Option (b) remains the real fix and is still open.

### T2 — Deleted tutors: server-side defence in depth `[ ]`
Core search already filters `deleted_at` (HANDOFF 2026-08-11), and `verify_account_deletion.mts`
covers delisting.

**Verified — the client-side hole is wider than this ticket says.** `deleted_at` is filtered in
`tutors.search` (`packages/core/src/api/index.ts:690-694`) and **nowhere else**:
`tutors.getById` (`:726-733`), `tutors.listSaved` (`:747`), `chat.listConversations` (`:1368-1372`)
and `chat.listParticipants` (`:1210-1214`) all render a deleted user as "Deleted account".
`delete-account` also leaves `tutor_courses`, availability, and `approval_status = 'approved'`
untouched.

The remaining gaps:
- RLS still exposes a deleted tutor's profile, since `approval_status` stays `approved`.
- Booking a deleted tutor by id (a saved link, an old chat) isn't refused on the server.

**Fix:** `delete-account` sets a `deactivated` status and removes `tutor_courses` and availability.
`is_approved_tutor()` also checks `deleted_at is null`.

### T7 — Course codes are free text `[ ]`
"CS100" and "CS 100" both exist in `tutor_courses`, and `courses.course_code` has no duplicates.
**Fix:** Normalize existing rows, add a unique constraint on `courses.course_code`, and add a
foreign key from `tutor_courses`. The pickers already prevent new drift.

---

## New — found by verifying client code (2026-09-10)

### T11 — The Weekly repeat toggle promises a series nothing creates `[x]` (blocker)
`b3.tsx:295-316` offers a Just once / Weekly segmented control and `b3.tsx:332-334` promises
"Locks this time with {tutor} every week." `b4.tsx:44` reads `repeatWeekly` for display only
(`:52`, `:160-167`) and never sends it; `ConfirmBookingInput` has no repeat field and
`confirm-booking:71-91` inserts exactly one row. A dead control plus copy promising a recurring
commitment is a 2.1 completeness finding **and** a consumer-protection problem.

**Decision (2026-09-10): remove the toggle for launch.** Delete the control and its copy from
`b3.tsx`/`b4.tsx` and `repeat` from `apps/mobile/lib/store.tsx:30`. Pair with **T6 option (a)**:
`buildDays()` in `apps/mobile/lib/data.ts:22-42` loops `i < 14` — make it a named constant of
**6** so no manual-capture hold outlives its ~7-day authorization, and fix the `:3` comment that
documents a "real 14-day booking window".

**Done (2026-09-10):** control and copy removed from `b3.tsx`, `b4.tsx`, `b5.tsx` and
`repeat` dropped from `lib/store.tsx`.
- [x] No repeat control anywhere; no copy implies a series.
- [x] The booking calendar offers at most 6 days — `BOOKABLE_DAYS` in `lib/data.ts`,
      enforced server-side by `BOOKING_HORIZON_DAYS` (verify_pricing step 10).
      **Note:** `DAYS` deliberately stays 14 — `tutor_calendar.tsx` pages it in weeks of
      7 for the tutor's own sessions, so shortening it blanked "Next week".

### T12 — "Coming soon" is one tap from the reviewer's Profile `[x]` (blocker, 2.1)
`__DEV__` is clean (0 hits), but these sit on reviewer paths:
- **`profile.tsx:258`** — "Payment methods / No card on file" → `notify()` → *"Built with backend
  — coming soon."* Highest risk. Wire it to the Stripe customer's saved methods, or remove the row.
- `tutor_profile.tsx:98` — Payouts falls back to `notify('Payouts')` with no Stripe URL.
- `t10.tsx:49` — every "While you wait" card is a bodyless `Alert.alert(label)`, shown right after
  tutor signup.
- `tutor_calendar.tsx:125,143` — availability open/close and week-copy are local-only and silently
  lost on reload. Device script step 6 hits this.
- `sessions.tsx:207` — saved-tutor un-save has no handler.
- `c1.tsx:90` / `xns.tsx:185` — literal "Demo: preview the tutor/student side →" links; confirm
  these are dev-launcher-only.
- Delete the `notify()` helper (`profile.tsx:23`, `tutor_profile.tsx:23`) once its callers are gone.

Leave the other `TODO(api)` markers (20 across 15 files) — `START_HERE` says not to pick up
unrelated ones during this push.

**Done (2026-09-10):** "Payment methods" row removed (cards are collected in
PaymentSheet per booking and never saved for management, so the row promised nothing that
exists); Payouts fallback now explains itself; the three `t10.tsx` cards route to
`/notifications`, `/edit_tutor` and `/ambassador_referrals`; `tutor_calendar.tsx` slot
taps and "Edit availability" now open `edit_availability.tsx`, which really persists via
`api.profile.updateAvailability()` — they used to be local-only and lost on reload;
saved-tutor un-save calls the `api.tutors.unsave()` that already existed; both
"Demo: preview the … side →" links removed (`xns.tsx` **is** reachable from the normal
no-show flow). The `notify()` helper is gone from both profile screens.
- [x] No reviewer-reachable button shows a stub alert or silently discards input.
- [ ] Walk the reviewer paths on device to confirm. **← needs a device**

### T13 — Edge Function error bodies are never read `[x]` (blocker; gates T1 and T4)
See the T1 `Verified:` note. `packages/core/src/api/index.ts:375` throws the raw
`FunctionsHttpError`, so every server error message in the app is the generic "Edge Function
returned a non-2xx status code". The deletion 409 copy and T4's friendly filter rejection both
depend on fixing this one function.

**Done (2026-09-10):** `invokeFn` reads the `FunctionsHttpError` response body and
rethrows an exported `FunctionError` carrying the server's `error` string and status.
- [x] `invokeFn` surfaces the server's `error` string and status — visible in the verify
      output, which now prints real copy ("The payment has not been authorized yet")
      instead of "Edge Function returned a non-2xx status code".
- [x] No call site depended on the old generic text (all read `.message` for display).

---

### T14 — Online sessions had no way to meet `[x]` (blocker, 2.1)
`b3.tsx` offered "Online — Integrated Video" with the copy *"A secure link appears here 10
minutes before the session — no app needed."* Nothing ever produced a link: `b4.tsx` sent
`meetingLink: undefined`, nothing else writes `bookings.meeting_link`, and `sessions.tsx:37`
just renders "Online". A student could pay for a video session and get no way to attend.
The reply draft told Apple *"Video sessions open a meeting link in the provider's own app."*

**Decision (2026-09-10): in-person only for launch.** The Virtual option, the false
"integrated video" card and the sniffed session type are gone from `b3.tsx`/`b4.tsx`;
`sessionType` is now always `in_person` for new bookings. Existing `video` rows still
render — we simply don't sell them.
- [x] No booking flow offers a session type that can't actually happen.
- [ ] **Remove the video/external-video claims from `APP_REVIEW_REPLY_DRAFT.md`** (§2
      "or over a video call", §4 "External video link", §5) — see T15.

### T16 — `pnpm check:preview` fails: 5 remote-only migrations `[ ]` (blocks pushing)
`pnpm check:preview` currently fails, and it's **pre-existing**, not from this push (the
new local files are `0029`/`0030`). The five App Review seed migrations listed in T8 were
applied straight to production with timestamp versions and have no local file, which is
exactly the red "Supabase Preview" cause `CLAUDE.md` documents.

**This needs Jadin — a session must not write to production.** Also note
`seed_app_review_accounts` contains password material, so its SQL **must not** be copied
into a repo file (`APP_REVIEW_START_HERE.md`: never write real reviewer credentials into
the repo).

**Recommended fix:** add five local, secret-free files that document what each remote
migration did without reproducing credentials, then relabel the remote rows to match.

**Half done (2026-09-17) — the repo half.** The five files exist. Note the numbers shifted:
`0031`/`0032` were taken by the payout-flag and filter-names migrations, so these are
**`0033`–`0037`**:

| local file | remote version | remote name |
| --- | --- | --- |
| `0033_cloud_only_add_watchmenventures_campus_domain.sql` | `20260905011827` | `add_watchmenventures_campus_domain` |
| `0034_cloud_only_wipe_crimson_test_seed.sql` | `20260905011847` | `wipe_crimson_test_seed` |
| `0035_cloud_only_seed_app_review_accounts.sql` | `20260905012006` | `seed_app_review_accounts` |
| `0036_cloud_only_seed_app_review_activity_data.sql` | `20260905012059` | `seed_app_review_activity_data` |
| `0037_cloud_only_seed_moderation_queue_sample.sql` | `20260905012108` | `seed_moderation_queue_sample` |

Each is comment-only and a deliberate no-op on every database, so `supabase db reset` and
preview branches are unaffected. None contains credentials, the domain row, or the
destructive wipe — each file says why it doesn't.

**Still needs Jadin — the production half.** `check:preview` keeps failing until the remote
rows are relabeled (it derives a version from the prefix before the first underscore):
```sql
update supabase_migrations.schema_migrations set version='0033' where version='20260905011827';
update supabase_migrations.schema_migrations set version='0034' where version='20260905011847';
update supabase_migrations.schema_migrations set version='0035' where version='20260905012006';
update supabase_migrations.schema_migrations set version='0036' where version='20260905012059';
update supabase_migrations.schema_migrations set version='0037' where version='20260905012108';
```
Run it in Studio → SQL Editor on the cloud project, then `pnpm check:preview` should pass.
Bypass once with `SKIP_SUPABASE_CHECK=1 git push` only if you're willing to let the
Preview check go red.

### T15 — Reconcile the reply with the shipped code `[x]`
Now that T5/T11/T12/T14 have changed behaviour, the reply has claims to fix:
- **Video:** remove it entirely (T14) — §2, the §4 services table, and the recording script.
- **Refunds:** the draft only describes the 24-hour case. Shipped `cancel-booking:70-79` is
  tiered — 100% over 24h, **50% between 2 and 24h**, 0% under 2h. Say so.
- **Booking window:** sessions are now bookable up to 6 days out, so "a time more than 24
  hours away" is still fine, but don't imply a two-week calendar.
- **Apple Pay:** *can* be claimed after all — `merchant.com.watchmenventures.noot` is
  configured in `app.json:104` and `_layout.tsx:77`. This corrects the caution below.
- **Reviews as UGC:** `/terms` calls reviews user-generated content, and `content_reports`
  supports `target_kind = 'review'`, but no `reportReview` exists and ratings are hidden
  app-wide. Either add the report path (T3) or describe reviews as not user-visible.
- **Push:** still correct to omit — 0 `expo-notifications` hits; the app never prompts.

**Done (2026-09-10).** `APP_REVIEW_REPLY_DRAFT.md` Part A and Part B both rewritten: video
cut everywhere, tiered refunds stated, server-side pricing described, ratings described as
collected-but-not-shown, ambassador bonuses described as recorded then paid by hand, the
UGC section rewritten to match what the filter and block enforcement actually do, Apple Pay
and Google Pay added, and the six-day booking window stated. The UA theme row is renamed
to "Crimson accent" (T22) so §6's no-trademark answer is true.

**Still needs Jadin:** every `[BRACKET]`, the recording, and the pre-send checklist at the
top of the file — which now flags that no Edge Function has been deployed and that
`check:preview` is failing (T16).

---

### T17 — `report-no-show` captured money before the session `[x]` (critical)
Found by an adversarial audit, 2026-09-10, and proven live. `report-no-show` selected
`status` and never checked it, and never looked at `scheduled_at` at all. A tutor could tap
**"Report a no-show" on an UPCOMING session** — `sessions.tsx:306` puts the link right next
to "Cancel session" — and capture the full hold days early for a session that never
happened. `complete-session` had the same gap.

**Fixed:** `assertSessionElapsed()` in `_shared/booking.ts`; both functions now require
`status = 'confirmed'` and the session's scheduled end to have passed. A no-show also has a
`NO_SHOW_WINDOW_HOURS = 48` upper bound, so a stale booking can't be turned into a payout
months later.
- [x] `verify_payout_guards.mts` steps 3-7: early no-show and early completion both 409
      with nothing captured; the legitimate after-the-fact no-show still refunds 100%;
      a 60-day-late report is refused.

### T18 — Capture happened before the payout destination was checked `[x]` (critical)
`complete-session` captured at `:62` then transferred at `:66`. Proven live with a stale
Connect id: the PaymentIntent reached `succeeded`/2200 while the function returned an
error and the booking row stayed `confirmed` with `stripe_charge_id: null` — student
charged, tutor unpaid, nothing flagged. Production holds 5 test-mode `acct_…` ids, so this
would have fired on the first live completion (T10).

**Fixed:** `assertPayoutReady()` retrieves the connected account and requires
`charges_enabled` + `payouts_enabled` **before** capturing, treating any retrieval failure
as "this id is unusable" (which is exactly the test→live case). If a transfer still fails
after a successful capture, the booking is marked `completed` with the new
`bookings.payout_failed_at` flag (migration `0031`) and the caller is told the payout is
pending, instead of an error that makes the row look untouched. Both Stripe calls stay
idempotency-keyed, so a retry is safe.
- [x] `verify_payout_guards.mts` steps 8-9: a stale Connect id captures nothing and leaves
      the booking untouched and not falsely flagged.

**Also fixed here:** raw Stripe error strings were being returned to the client, and
Stripe's message for an inaccessible account **embeds a partially-redacted API key**. All
five money functions now log the detail and return generic copy; user-facing messages come
only from explicit checks and `BookingError`.

### T19 — `reschedule-booking` could rewrite a session one-sidedly `[x]` (critical)
`propose` validated only that the date parsed — no future check, no horizon check, no clash
check — and `accept` never compared the caller to `reschedule_proposed_by`. Proven live:
one party proposed **+60 days** and accepted its own proposal (defeating T6(a)'s hold cap so
the tutor could never be paid), then proposed **yesterday**, self-accepted, and cancelled →
0% refund and the full amount captured.

**Fixed:** `propose` now requires a future time inside `BOOKING_HORIZON_DAYS` and checks
the tutor's other bookings for a clash; `accept`/`decline` must come from the other party;
and `accept` re-checks that the proposed time hasn't passed while the proposal sat.
- [x] `verify_payout_guards.mts` steps 10-13.

### T20 — The content filter missed display names `[x]`
0029 covered messages, bios and review comments. The audit saved a slur as a **first name**
while the same word was rejected in chat — and a name is more visible than a message
(search results, tutor cards, chat headers, admin).

**Fixed:** migration `0032` extends the trigger to `users.first_name`, `users.last_name`,
`users.major` and `bookings.location` (which `confirm-booking` inserts from the request
body as service role).
- [x] `verify_filter.mts` now 16/16, including names, `major`, booking location, and the
      review-comment case that previously skipped.
- [ ] `tutor_profiles.subjects[]` is still unfiltered — it's a `text[]` of course codes
      from a picker, and the trigger reads a scalar. Low risk; needs an array-aware variant.

### T21 — Three more screens discarded or faked user input `[x]` (2.1)
T12 missed these:
- **`t5.tsx` (Set Availability, tutor signup)** had **zero API calls** — the whole grid,
  the locations list and an online toggle were local state that "Save & Continue" threw
  away, and the grid arrived **pre-filled** with invented hours. It now starts empty and
  persists through `api.profile.updateAvailability()`, merging adjacent 3-hour blocks into
  weekly windows. The locations editor is gone (there is nowhere to store a per-tutor
  location — `tutoring_locations` is a read-only campus list) and so is the online toggle
  (T14).
- **`b5.tsx:39` and `tb2.tsx:171`** claimed "Added to your calendar" with no
  `expo-calendar` dependency anywhere. Both buttons removed.
- **`b5.tsx:52`** told the student "We've emailed the details to you both" — no email code
  exists in the repo. Rewritten to point at Sessions and chat.

### T22 — The app named a university while the reply denied trademarks `[x]` (3.2 / 5.2)
`profile.tsx` and `tutor_profile.tsx` shipped a **"School colors — University of Alabama —
crimson"** row, contradicting §6 of the reply. Renamed to "Crimson accent"; the assets
themselves were already clean. The reply now explains the colour explicitly.

---

### T23 — No Terms of Use document is published `[ ]` (blocker, 1.2)

**Found 2026-09-17,** while pointing the in-app links at the new `trynoot.com` domain.
`https://trynoot.com/privacy` is live (200) but is a **Privacy Policy only**:
`trynoot.com/terms` returns **404**, and the live `/privacy` text contains no "Terms of Use",
no "zero tolerance" and no "objectionable" (grepped the rendered page).

Meanwhile `set_password.tsx:117-126` shows a required checkbox reading "I agree to noot's
**Terms of Use** and Privacy Policy. noot has zero tolerance for objectionable content and
abusive behavior." The on-screen sentence is fine; the **Terms of Use link opens the privacy
policy**, so a reviewer who taps it finds no terms and no zero-tolerance clause. Guideline 1.2
is the one Apple already cited us on, so this is worth treating as a blocker.

`apps/mobile/lib/legal.ts` currently maps both `privacy` and `terms` to `/privacy` via a
one-line `PATHS` map — publishing a real page is a one-word change there.

**Done when:**
- [x] **Text drafted: `legal/TERMS_OF_USE.md`** (2026-09-17). Covers zero tolerance (§5), the
      24-hour report commitment (§7), academic integrity (§8), the exact cancellation tiers and
      the 17.5% fee (§10–11), and the no-university-affiliation statement T22 needs (§22). Every
      policy number in it was checked against the code. **Needs a lawyer's review before it goes
      up**, especially §17–§19 and the 18+ age requirement in §2.
- [ ] That text is **published and public** — either at `trynoot.com/terms` or appended to the
      `/privacy` document. ← **needs Jadin**
- [ ] `PATHS.terms` in `apps/mobile/lib/legal.ts` points at it (one word if it gets its own page;
      no change at all if it's appended to `/privacy`).
- [x] `TERMS_VERSION` matches the document's effective date — both are now `2026-09-17`.
      **Note:** this records acceptance of a document that is not live yet. Publishing is what
      closes the gap; don't ship a build to real users before it's up.
- [ ] The `[TERMS URL]` brackets in `APP_REVIEW_REPLY_DRAFT.md` are filled in.

**Interim option if publishing is slow:** append a Terms of Use section to the existing
`/privacy` document (it is already the combined destination), then the current link mapping
becomes true with no app change.

---

### T24 — `connect-onboarding-link` created duplicate Stripe accounts `[x]` (2026-09-19)

**Found** while reviewing the live cutover: one tutor had **5** Connect accounts created
within 2 seconds, another had **2** within 1 second. Not repeated taps over time —
sub-second, so concurrent.

**Cause: a check-then-act race.** The function read `stripe_connect_account_id`, saw null,
and created an account. The "Payout account" row stayed tappable while the Edge Function
cold-started, so several invocations overlapped; each read null before any of them wrote,
each created its own Stripe account, and the last write won. The others were orphaned. The
original also **discarded the upsert error**, so a failed write looked like success and
guaranteed another duplicate on the next tap.

**Fixed, three defences server-side plus one client-side:**
1. `accounts.create` now passes `idempotencyKey: connect_acct_<user.id>`, so Stripe itself
   collapses concurrent creates into one account.
2. The persist is conditional (`.is('stripe_connect_account_id', null)`) and checks which
   rows it actually updated, so a losing racer detects it lost and **deletes the account it
   just created** instead of orphaning it.
3. Persist failures now return a 500 and clean up, rather than handing back a link to an
   account nobody recorded.
4. `tutor_profile.tsx` guards `setupPayouts` with a `payoutBusy` flag and shows
   "Opening Stripe…" on the row.

It also now recovers from a stored id that is dead under the current keys
(`resource_missing` / `account_invalid` / `permission_error`) by clearing it and creating a
fresh one — the sandbox-to-live case from T10, which would otherwise have been permanently
stuck.

**Verified against the real live Stripe account:** 5 simultaneous creates with the new
idempotency key produced **1** account, 4 collapsed as `idempotency_key_in_use`, and a
sequential retry returned that same account. All test accounts were deleted
(`deleted: true`).

**Incidental finding — worth knowing:** the **sandbox rejects Accounts v1 outright**
("Stripe no longer recommends Accounts v1 ... use POST /v2/core/accounts"), while the live
account still accepts it. So Connect onboarding cannot be exercised on the sandbox at all,
and a future Stripe deprecation of v1 on live would break onboarding entirely. Migrating to
`/v2/core/accounts` should get its own ticket before launch.

---

## Deliberately NOT claiming (keep the reply honest)
- **Push notifications:** not built (only the in-app center). Don't list APNs as a service.
  Confirm the app never shows a notification-permission prompt.
- ~~**Apple Pay:** don't mention it unless a merchant ID is configured.~~ **Verified
  2026-09-10: it IS configured** (`app.json:104`, `_layout.tsx:77`). Claimable, but still
  confirm it actually appears in PaymentSheet on the device build before saying so.
- **Reviews visible to users:** ratings are hidden app-wide. Describe reviews as moderated, not as
  a browsable feature.

---

## Device test script (TestFlight build; also the recording shot list)
1. Cold launch → sign up with a campus email → the email arrives → link → set password → accept
   Terms → role
2. Search a course by code **and** by name → tutor profile
3. Book a slot more than 24h out → PaymentSheet (live card) → confirmed → appears in Upcoming
4. Chat: text, photo, and file, in both directions
5. Long-press a message → Report. Profile → Report user → Block. The tutor disappears from search.
6. Switch to Tutor mode → the session shows → Payout account opens Stripe onboarding
7. Tutor: Mark session complete on a past session → payout appears in the Stripe dashboard
8. Admin: approve a tutor → that tutor stays in Tutor mode; the report appears in the queue
9. Cancel an upcoming session more than 24h out → the hold is released in Stripe
10. Deletion-test account → Delete account → signed out → login fails
11. Kill the app mid-flow, reopen, and check the Face ID gate. Try the whole flow with dark mode
    and the crimson theme.
