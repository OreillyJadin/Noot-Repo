# Open items

Everything still open from the Claude-era handoffs now in `docs/archive/`, checked against
`main` at `6915e0f` on 2026-10-17. "Check in prod" means the repo can't show it; look at the
production project, Stripe, App Store Connect or the website. File names below are in
`docs/archive/`. Delete a line when it's done.

## In progress (other PRs, 2026-10-17)

- STU-07: Back after signing out.
- Landing screen: remove the made-up counts (`DECISIONS_NEEDED_2026-10-02.md` §3).
- "Become an ambassador" doesn't keep the ambassador mode (`ISSUES_2026-10-03.md` 3.1).
- Tutor payouts come from noot's Stripe balance instead of the session's own charge (3.2).
- TUT-4: $10 minimum rate, and admin $0 bookings.
- SEC-006: which tutor fields other users can see.
- Ambassador cash-out admin screens (replaces the Studio SQL runbook in `HANDOFF_2026-10-03.md`; 3.4).
- Community Guidelines for every role.
- IOS-2: Dynamic Type.
- `require_admin_mfa` (now on in prod).

## App Store submission (check in prod)

- A fresh SDK 57 production build in TestFlight (`PICKUP_HERE.md`, `APP_REVIEW_TICKETS.md` T0).
- Stripe live cutover: live keys, the review tutor onboarded to Connect in live mode, then
  `DEMO_CONNECT_ACCOUNT=acct_… node supabase/seed_app_review.mjs --apply` (T8, T10).
- The App Review ambassador account approved in `ambassador_approvals` (`ISSUES_2026-10-03.md` 1.3).
- `pnpm check:preview`: the five remote-only App Review seed migrations relabelled to their
  local files (T16, needs `SUPABASE_ACCESS_TOKEN`).
- "Confirm email" on in Supabase Auth (1.5).
- Privacy policy says inviters see an invited friend's first name, last initial and whether
  they've completed a session (1.4). Not found on trynoot.com/privacy on 2026-10-17.
- Store listing: screenshots, description, privacy labels (`ASC_SUBMISSION_CHECKLIST.md`).
- Device pass by two people with the script at the end of `APP_REVIEW_TICKETS.md`, the
  recording, then the reply in `APP_REVIEW_REPLY_DRAFT.md` (fill every `[BRACKET]`, drop the
  video-call claims, T14). Includes the sign-up → emailed link → invite code applied flow
  that has never been run on a phone (`ISSUES_2026-10-03.md` §2).

## Code (checked on main)

- **Blocks in search are one-way and client-side** (T3). `tutors.search` in
  `packages/core/src/api/index.ts` hides only people I blocked; someone who blocked me still
  shows up. Booking is already refused server-side (`isBlockedBetween` in
  `supabase/functions/_shared/booking.ts`).
- **Reviews can't be reported** (T3): `content_reports.target_kind = 'review'` exists but there's
  no `reportReview`. Reporting a message is long-press only, with no visible affordance.
- **Deleting a tutor account leaves the profile live** (T2): `delete-account` leaves
  `tutor_courses`, availability and `approval_status = 'approved'`. Booking a deleted tutor is
  already refused server-side.
- **Course codes are free text in `tutor_courses`** (T7): no foreign key to `courses`, and
  "CS100" / "CS 100" can both exist. Only `courses` has a unique constraint.
- **`tutor_profiles.subjects[]` isn't content-filtered** (T20; left out of `0032` because it's
  picker-only, but the column takes any text).
- **A failed payout isn't retried** (3.3): `complete-session` on a completed booking returns
  `alreadyComplete` without retrying the transfer. Check after the payouts-from-charge PR.
- **Cash-out collects no payout details and shows no status to the ambassador** (3.5). Check
  whether the cash-out admin PR covers the ambassador side.
- **A new account's name comes from whoever first requests its sign-up link** (3.7):
  `handle_new_user` (`0040`) reads `first_name` / `last_name` from the link request's metadata.
- **Owners can still write `created_at` / `deleted_at` on their own `users` row** (3.8).
  `email` is locked (`0071`) and `active_role` / `status` are guarded; the rest of
  `users_update` has no column restriction.
- **No auto-complete 24h after a session** — done by the `auto-complete-sessions` cron in
  migration `0092`.
- **7 `TODO(api)` stubs left in `apps/mobile`**: student name on `tutor_calendar`, booking id
  on calendar sessions, `b5` → chat, the notification centre in `chat` / `chat_tutor`, the
  exact payout in `c4`, the past-sessions note in `sessions`.
- No one-tap Copy for the referral code (`expo-clipboard` not added; `DECISIONS_NEEDED` A1).
- Tests that don't exist yet (`ISSUES_2026-10-03.md` §5): the `complete-session` payout-failure
  path, credit returned on a tutor no-show via `report-no-show`, a tutor-initiated cancel and a
  cancel under 2 hours, two reversals racing an award, `lib/pendingInvite.ts` on real AsyncStorage.

## Decisions for Jadin

- Bump the Terms version for the T6 edits to §9, §11 and §17? `TERMS_VERSION` is still
  `2026-09-17` (`DECISIONS_NEEDED_2026-10-02.md` §1).
- Referral $5 payout: recorded as owed and paid by hand until decided (Q3).
- Subject categories beyond Business / STEM / Humanities (D4).

Limits left as they are by decision (won disputes, clawbacks, invite-claim rules, `ua.edu` vs
`crimson.ua.edu`) are in `ISSUES_2026-10-03.md` §4.
