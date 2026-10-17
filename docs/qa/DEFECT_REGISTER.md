# QA defect register

The defect rows and statuses below follow the supplied `defects_draft.md`. Structured workstream outputs provide the listed reproduction and regression details. iOS screenshot references are basenames only; screenshots are not committed.

Related QA docs: [APP_INVENTORY.md](APP_INVENTORY.md) · [TEST_PLAN.md](TEST_PLAN.md) · [SECURITY_REVIEW.md](SECURITY_REVIEW.md) · [TEST_RESULTS.md](TEST_RESULTS.md).

## Open – needs decision

| ID | Severity | Area | Summary | Status | PR | Migration | Evidence/regression test |
|---|---|---|---|---|---|---|---|
| AMB-04 | Low | Rate limit | Signed-out invite-code limit keyed on caller-settable IP header. | Open – needs decision | — | — | Probe R3/R4 (local only); production forwarded-header behavior untested. |
| TUT-4 | Medium | Pricing | Server accepts $0–9.99 while app `MIN_HOURLY_RATE=10`; 4 prod rows <$10. | Open – needs decision | — | — | `set_tutor_courses` with rate $5 accepted and stored; regression script unclear. |
| TUT-5 | Low | Availability | Overlapping availability windows accepted. | Open – needs decision | — | — | Insert two overlapping windows for the same day; both stored; regression script unclear. |
| SEC-006 | Medium | Data exposure | Any authenticated user reads all columns of approved tutors, including email, Stripe customer/Connect IDs, transcript path, and signed name. | Open – needs decision | — | — | `select=*` on `users` and `tutor_profiles` returned all columns; regression script unclear. |
| IOS-2 | Medium | A11y | Dynamic Type AX-XXXL: titles/tab labels break mid-word; chips clip. | Open – needs design decision | — | — | `ios_05_sessions_ax_xxxl.png` |

## Open

| ID | Severity | Area | Summary | Status | PR | Migration | Evidence/regression test |
|---|---|---|---|---|---|---|---|
| STU-07 | Medium | Auth/navigation | Android Back after sign-out/account deletion shows previous user's cached Sessions screen; hypothesis: `router.replace('/')` leaves stack and tabs lack an auth guard. | Open | — | — | Repro: sign in, open Sessions, Profile → Sign out, press Android Back. Root cause is a code hypothesis; regression test unclear. |

## Fixed (open PR)

| ID | Severity | Area | Summary | Status | PR | Migration | Evidence/regression test |
|---|---|---|---|---|---|---|---|
| AMB-01 | High | Ambassador credit | Concurrent invite rewards could skip the 5-invite milestone bonus (`award_milestones` counted without `credit_lock`). | Fixed (open PR) | #78 | 0075 | `scripts/verify_credits.mts` overlap checks (red 79/2 → green 81/0). |
| AMB-02 | High | Session lifecycle | `complete-session` vs cancel/no-show races could all succeed, leaving an inconsistent terminal state. | Fixed (open PR) | #79 | — | `scripts/verify_session_race.mts` (red 4/4 → green 8/0); exactly one concurrent action should succeed. |
| AMB-02b | Medium | Cancellation | Completed/no-show sessions could still be cancelled and refunded. | Fixed (open PR) | #79 (overlaps #87) | — | `scripts/verify_session_race.mts`: a later cancel is refused. |
| AMB-03 | Medium | RLS | Signed-in users could write their own `ambassador_profiles` totals/earnings/code. | Fixed (open PR) | #80 | 0076 | `scripts/verify_credits.mts` profile checks (red → green 82/0). |
| TUT-1 | High | Ratings | `submit-rating` accepted ratings on pending/confirmed/cancelled bookings. | Fixed (open PR) | #82 (duplicate in #87) | — | `scripts/verify_rating_completed_only.mts` (14/14; CI green); status check was absent after party authorization. |
| TUT-2 | High | Pricing | Direct writes to `tutor_courses.hourly_rate` bypassed the $0–120 bound. | Fixed (open PR) | #83 | 0085 | `scripts/verify_tutor_rate_bounds.mts` (8/8; CI green); direct PostgREST update was the repro. |
| TUT-3 | Low | UI | Community Guidelines sections without bullets rendered paragraphs twice. | Fixed (open PR, unit-tested, not device-checked) | #84 | — | `apps/mobile/test/guidelines.test.ts` (unit test; not re-verified on device). |
| SEC-001 | High | Booking | Bookings/student reschedules were not checked against tutor availability; the whole session must now fit one America/Chicago window. | Fixed (open PR) | #85 | — | `scripts/verify_tutor_availability.mts` (15/15); prior booking and reschedule at 09:00 returned 200 outside Sara's 14:00–19:00 window; 18:30 + 60 min now returns 409. |
| SEC-002 | High | Account deletion | Deleted account access token still read/wrote via PostgREST until JWT expiry. | Fixed (open PR) | #86 | 0070 | `scripts/verify_deleted_token.mts` (11/11); `is_active_user()` checked status only while deletion left status active with `deleted_at` set. |
| SEC-003 | High | Cancellation | Completed booking could be cancelled with 100% refund (same root as AMB-02b). | Fixed (open PR) | #87 (overlaps #79) | — | `scripts/verify_booking_state.mts` (11/11); prior guard rejected only `cancelled` status. |
| SEC-004 | Medium | Ratings | Ratings accepted for pending/cancelled bookings (same as TUT-1). | Fixed (open PR) | #87 (overlaps #82) | — | `scripts/verify_booking_state.mts` (11/11); `submit-rating` did not check booking status. |
| SEC-005 | High | Users/ban | Users could rewrite own `users.email`, evading banned re-registration block. | Fixed (open PR) | #88 | 0071 | `scripts/verify_user_email_lock.mts` (7/7); own-row email PATCH returned 200 and persisted. |
| IOS-1 | Medium | UI | Cancel/No-show strip showed another booking's day/time. | Fixed (open PR), sim-verified | #89 | — | `ios_04_cancel_screen_suspect.png`; fixed retests: `ios_07_cancel_fixed.png`, `ios_08_noshow_fixed.png`. |
| IOS-3 | Medium | UI/money | No-show showed refund $40 vs $46.80 paid. | Fixed (open PR), sim-verified | #89 | — | `ios_09_noshow_refund_fixed.png`. |
| STU-01 | Medium | Profile | Blank/whitespace/>50-character first/last names accepted at onboarding and Edit personal (client and server). | Fixed (open PR) | #90 | 0080 | `apps/mobile/test/profileValidation.test.ts`; `scripts/verify_profile_names.mts` (5/5); no client validation or server-side name check before fix. |
| STU-02 | Low | Guidelines | Paragraphs rendered twice (same as TUT-3). | Fixed (open PR, not re-verified) | #84 | — | `apps/mobile/test/guidelines.test.ts`; device re-check not done. |
| STU-03 | Medium | Ratings | Rating accepted for pending/future booking (same as TUT-1/SEC-004). | Fixed (open PR, not re-verified by A) | #82; #91 also adds elapsed-session guard | — | `scripts/verify_rating_completed_only.mts` (14/14 in B); A did not re-verify; prior pending-future call returned 200 and inserted a review. |
| STU-04 | Low | Ratings | `submit-rating` persisted a 20,000-character comment; UI max is 500. | Fixed (open PR) | #91 | — | `scripts/verify_rating_guards.mts` (8/8); server now rejects comments over 500 characters. |
| STU-05 | Medium | History | `api.listPast` omitted `no_show` bookings from history. | Fixed (open PR) | #92 | — | `scripts/verify_past_scope.mts` (7/7). |
| STU-06 | Medium | History | `api.listPast` was unscoped; dual-role users saw tutor bookings in student history. | Fixed (open PR) | #92 | — | `scripts/verify_past_scope.mts` (7/7). |

## Duplicates/overlaps

- SEC-003 ≈ AMB-02b.
- SEC-004 ≈ TUT-1 ≈ STU-03.
- TUT-3 ≈ STU-02.
- `submit-rating` was touched by #82, #87, and #91.
- `cancel-booking` was touched by #79 and #87.

## Product decisions pending

- AMB-04: signed-out invite-code rate-limit key when IP headers are caller-settable.
- TUT-4: server's $0–9.99 acceptance versus the app's $10 minimum.
- TUT-5: whether overlapping tutor availability windows should be merged or refused.
- SEC-006: which approved-tutor columns are visible to other authenticated users.
- IOS-2: Dynamic Type AX-XXXL design cap.
- No-show ratability after #82.
- Whether student-cancelled bookings (`cancel_reason` null) appear in history.

## Observations (not defects)

- Dark mode is an in-app preference, defaults to light, and ignores system appearance.
- Slot picker uses device-local time while server availability checks use America/Chicago.
- Picker offers 90/120-minute starts that overrun the availability window.
- Android reschedule-via-UI attempt did not complete once; request was not captured, so this remains unconfirmed. API reschedule passed.
