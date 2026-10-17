# QA audit test results

**Overall verdict:** Recorded workstreams total 238 passed, 34 failed, 4 blocked, and 25 skipped (301 checks). Nothing was merged and nothing was written to production.

Related QA docs: [APP_INVENTORY.md](APP_INVENTORY.md) · [TEST_PLAN.md](TEST_PLAN.md) · [SECURITY_REVIEW.md](SECURITY_REVIEW.md) · [DEFECT_REGISTER.md](DEFECT_REGISTER.md).

## Counts per workstream

| Workstream | Surface | Passed | Failed | Blocked | Skipped | Total |
|---|---|---:|---:|---:|---:|---:|
| A Student | Android emulator + API | 37 | 9 | 2 | 9 | 57 |
| B Tutor/Admin | Android emulator + API | 82 | 6 | 1 | 12 | 101 |
| C Ambassador/credit | API + DB | 83 | 6 | 1 | 1 | 91 |
| D Security | API + DB + verify scripts | 27 | 10 | 0 | 3 | 40 |
| E iOS (lead) | iPhone 17 sim, iOS 26.5, Expo Go | 9 | 3 | 0 | 0 | 12 |
| **Total** |  | **238** | **34** | **4** | **25** | **301** |

Totals double-check: workstream totals 57 + 101 + 91 + 40 + 12 = 301; outcome totals 238 + 34 + 4 + 25 = 301. Workstream counts are the settled reports, not re-runs.

## Booking-to-chat E2E

All six steps passed. Recording filename: `booking_chat_e2e.mp4`.

| Step | Check | Result |
|---:|---|---|
| 1 | Alex books Sara for BSC 103 and includes a note. | PASS |
| 2 | Alex's Chats shows “Awaiting Sara's response”. | PASS |
| 3 | Sara's Chats shows “New request”; the note is readable before acceptance. | PASS |
| 4 | Sara accepts from tutor Home; the auto-posted “Accepted your BSC 103 session — see you Saturday, October 17 at 5:00 PM!” appears. | PASS |
| 5 | Sara replies; signed back in as Alex, the badge is lifted, her messages render, and Sessions shows the booking confirmed. | PASS |
| 6 | With no note, the helper posts the fallback intro. | PASS |

## iOS audit checks

Evidence references are screenshot basenames only; screenshots are not committed. Retests are not counted in Workstream E totals.

| Check | Result | Evidence |
|---|---|---|
| Booking-to-chat E2E, steps 1–6 | PASS | `booking_chat_e2e.mp4` |
| Chat keyboard keeps input visible | PASS | `ios_01_chat_keyboard.png` |
| Special characters (`"quotes" & <tags>`) render literally | PASS | `ios_02_special_chars_sent.png` |
| Background-to-foreground keeps the thread | PASS | `ios_03_after_foreground.png` |
| Cancel/no-show strips show the selected booking time | Initial FAIL (IOS-1); fixed in #89 and retested PASS | `ios_04_cancel_screen_suspect.png`, `ios_07_cancel_fixed.png`, `ios_08_noshow_fixed.png` |
| No-show refund amount | Initial FAIL (IOS-3); fixed in #89 and retested PASS | `ios_09_noshow_refund_fixed.png` |
| Dynamic Type AX-XXXL | FAIL (IOS-2 open) | `ios_05_sessions_ax_xxxl.png` |
| Dark appearance | N/A by design: in-app preference defaults to light and ignores system appearance | `ios_06_sessions_dark.png` |

## Build, lint, and test status

- PR #89 branch: lint passed with 0 errors and 47 warnings (same as main baseline).
- Typecheck passed.
- 199 unit tests passed; main baseline was 191.
- CI was green; Supabase Preview was skipped.
- Main-baseline Expo iOS export passed.

## Verify-script baseline

57/62 verify scripts failed for environment reasons (the strict password rule rejects `seed_demo.mjs` accounts using `password123`); 5 passed. Workstreams A and D agree on these counts. Fixed since by ERR-014: the seeds and verify scripts use `DEV_PASSWORD` from `scripts/_devPassword.mjs`, which meets the rule, and CI no longer relaxes it.

## Coverage gaps

**Settled cross-workstream union:** realtime simultaneous users; push notifications (Expo Go); real Stripe PaymentSheet/refunds/Connect payouts (simulated); payments webhook signature (no `whsec_test`); Face ID (emulator); reschedule via UI (A: did not complete once, unconfirmed); completion/rating UI c1/c2/c4 (API only); no-show UI on Android and tutor-role no-show view on iOS; saved tutors; `edit_courses`; offline booking; Back mid-booking; systematic keyboard sweep (Android); Chats inbox and history persistence on Android; Community Guidelines fix (#84) on device; tutor/admin screens not all opened natively (see B); realtime subscription to another user's conversation; cross-user chat-attachment download; suspended/banned attack set and non-admin calls to admin functions (code-read only); duplicate credit redemption; accepting an expired request; reschedule into overlap (code-read); `pnpm check:preview` (targets prod).

**Additional Workstream B untested items:** t1–t10 tutor application via UI (API-covered); t8 Stripe Connect onboarding (blocked, needs hosted browser login); UI Mark session complete (blocked, fixture tutor lacks Stripe test Connect account; API-covered); Admin screens in UI with TOTP (API-covered); tb1 new-booking alert/push UI; tb2, `tutor_calendar`, standing, `tutor_profile`, and `edit_*` screens in UI; `xtc`/`xtr`/`xns`/`c3` in UI (API-covered); Offline accept; backgrounding during submission; Leave tutor role in UI (API-covered); student-facing state after completion in UI (API-covered); TUT-3 fix re-check on device.

**Additional Workstream C untested items:** Magic-link sign-up via Mailpit (admin-created users + `claim_invite` used); mobile screens UI (verified via core RPCs `ambassador_home` reads); real-Stripe (`sk_test`) concurrency races and transfer-failure branches (need a failing Connect transfer); payments-webhook refund/dispute reversal via the function (`verify_payments_webhook` blocked, needs `whsec_test_` secrets); production-edge forwarded-header behavior for AMB-04.

## PRs #78–#92

| PR | Purpose | Migration |
|---:|---|---|
| #78 | Lock ambassador milestone awards against concurrent invite rewards. | 0075 |
| #79 | Guard session completion/cancel/no-show races and terminal cancellation state. | — |
| #80 | Restrict direct writes to ambassador profile totals, earnings, and referral code. | 0076 |
| #81 | Purpose unclear in supplied sources. | — |
| #82 | Accept ratings only for completed bookings. | — |
| #83 | Bound tutor course rates to $0–120. | 0085 |
| #84 | Fix duplicate Community Guidelines paragraphs for sections without bullets. | — |
| #85 | Require the full booking/reschedule duration to fit tutor availability. | — |
| #86 | Reject deleted-account tokens after account deletion. | 0070 |
| #87 | Guard cancellation of completed bookings and ratings on invalid booking states; overlaps #79/#82. | — |
| #88 | Lock user email against self-update. | 0071 |
| #89 | Fix selected-booking time on cancel/no-show screens and real no-show amounts. | — |
| #90 | Validate profile names on client and server. | 0080 |
| #91 | Bound rating comments and add an elapsed-session rating guard. | — |
| #92 | Include no-show bookings in Past history and scope history by role. | — |

## Open questions for the team

Detail for each is in [DEFECT_REGISTER.md](DEFECT_REGISTER.md) and [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

| ID | Question | Status |
|---|---|---|
| AMB-04 | The signed-out invite-code check (30 tries / 10 min) identifies callers by an IP header the caller can set. Key it only on a platform-set header, also add a global cap, or leave it? Depends on whether Cloudflare/Supabase overwrite `x-forwarded-for` / `cf-connecting-ip` in production. | Open |
| TUT-4 | The app's minimum rate is $10/hr, but the server accepts $0–9.99 (4 prod tutor courses are under $10). Enforce $10 on the server? If yes, those 4 rows need repricing first. | Open |
| TUT-5 | Tutors can save overlapping availability windows on the same day. | Decided: merge them |
| SEC-006 | Any signed-in user can read every column of an approved tutor's `users` / `tutor_profiles` row (email, Stripe customer and Connect IDs, transcript path, signed agreement name). Restrict to display fields? | Open |
| IOS-2 | At the largest accessibility text sizes, titles and tab labels break mid-word. Cap font scaling, or redesign those layouts? | Open |
| Ratings | Should no-show sessions be ratable? | Decided: no (current behavior after #82) |
| History | Should bookings a student cancelled appear in their past sessions? | Decided: yes |
