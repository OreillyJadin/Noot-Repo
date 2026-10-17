# Security review

## 1. Scope and method

Workstream D reviewed the local Supabase stack on Linux VMs using synthetic users. PaymentIntents were simulated; there were no production writes. The structured run recorded 27 passed, 10 failed, 0 blocked, and 3 skipped.

One read-only production query showed 34 tutor rates, none outside $0–120, and 4 below $10. No production data was written.

For the schema-level RLS, callable SECURITY DEFINER RPC, and Storage inventory, see [`APP_INVENTORY.md`](APP_INVENTORY.md); those facts are not duplicated here.

## 2. Findings

| ID | Severity | Area | Attack / repro | Status | PR | Migration | Regression script |
|---|---|---|---|---|---|---|---|
| SEC-001 | High | Booking / reschedule | As Alex, create-payment-intent then confirm-booking for Sara at 09:00 America/Chicago (outside 14:00–19:00) returned 200; reschedule to 09:00 also returned 200. The whole session must fit one window; 18:30 + 60 min → 409. | Fixed-verified | #85 | unclear | `scripts/verify_tutor_availability.mts` (15/15) |
| SEC-002 | High | Account deletion | After delete-account, use the old access token to select own rows and insert a message, content report, and push token; succeeded until JWT expiry. | Fixed-verified | #86 | 0070 | `scripts/verify_deleted_token.mts` (11/11) |
| SEC-003 | High | Cancellation | Cancel a completed booking as student; returned 200, status `cancelled`, `refund_percent` 100; expected 409. | Fixed-verified | #87 | none | `scripts/verify_booking_state.mts` (11/11) |
| SEC-004 | Medium | Ratings | Submit a rating on a pending or cancelled booking; returned 200 and created a review; expected 409. | Fixed-verified | #87 | none | `scripts/verify_booking_state.mts` (11/11) |
| SEC-005 | High | Users / ban re-registration | PATCH own `/rest/v1/users` row with a replacement email; returned 200 and persisted, enabling evasion of the banned re-registration block. | Fixed-verified | #88 | 0071 | `scripts/verify_user_email_lock.mts` (7/7) |
| SEC-006 | Medium | User / tutor-profile data exposure | `select=*` on `users` and `tutor_profiles` for an approved tutor returned all columns, including email, Stripe IDs, transcript path, and signed name; expected display fields only. | Fixed (open PR) | fix/tutor-public-fields | 0086 | `scripts/verify_tutor_public_fields.mts` |
| AMB-01 | High | Ambassador credit | Concurrent invite rewards could skip the 5-invite milestone bonus (`award_milestones` counted without `credit_lock`). | Fixed (open PR) | #78 | 0075 | unclear |
| AMB-02 | High | Session lifecycle | `complete-session` versus cancel/no-show races could all succeed, leaving an inconsistent terminal state. | Fixed (open PR) | #79 | unclear | unclear |
| AMB-02b | Medium | Cancellation | Completed/no-show sessions could still be cancelled and refunded. | Fixed (open PR) | #79 (overlaps #87) | unclear | unclear |
| AMB-03 | Medium | RLS | Signed-in users could write their own `ambassador_profiles` totals, earnings, and code. | Fixed (open PR) | #80 | 0076 | unclear |
| AMB-04 | Low | Rate limit | Signed-out invite-code rate limit was keyed on a caller-settable IP header. | Open — needs decision | — | unclear | unclear |
| TUT-1 | High | Ratings | `submit-rating` accepted ratings on pending, confirmed, or cancelled bookings. | Fixed (open PR) | #82 (duplicate in #87) | unclear | unclear |
| TUT-2 | High | Pricing | Direct writes to `tutor_courses.hourly_rate` bypassed the $0–120 bound. | Fixed (open PR) | #83 | 0085 | unclear |
| TUT-4 | Medium | Pricing | Server accepts $0–9.99 while app `MIN_HOURLY_RATE=10`; 4 production rows are below $10. | Open — needs decision | — | unclear | unclear |

Duplicates: SEC-003 ≈ AMB-02b; SEC-004 ≈ TUT-1.

## 3. Open decisions

- **SEC-006:** Decided (Jadin): other signed-in users see only display fields (name, photo, bio, courses and rates, rating, session count, Verified badge) plus what booking needs (id, approval state); everything else is owner / admin / service_role only. Implemented in 0086 via the `tutor_public_profiles` view.
- **AMB-04:** Decide the intended signed-out invite-code rate-limit policy when the caller can set the IP header; the trusted key/policy is unclear in the source.
- **TUT-4:** Decide how to resolve the app's $10 minimum versus server acceptance of $0–9.99; the intended minimum is unclear in the source.

## 4. Residual risks

Verbatim from Workstream D:

> Table-wide authenticated INSERT/UPDATE grants make new columns client-writable unless a trigger guards them, Client picker offers starts that overrun the window for 90/120-min sessions; the server now refuses them (UX follow-up), Availability timezone hard-coded to America/Chicago, PR #87 overlaps #79/#82 (rebase conflicts), 57/62 verify scripts can't run on a strict-password stack, report-no-show final update lacks a status guard (race untested)

## 5. Untested areas

Verbatim from Workstream D:

> Realtime subscription to another user's conversation, Cross-user chat-attachment download, Suspended/banned user attack set (code-read only), Non-admin calls to admin Edge Functions (code-read only), Duplicate credit redemption, Double payout with real Connect transfers (simulated), Accepting an expired request; reschedule into an overlap (code-read), Payments webhook signature (no whsec_test_ secrets), verify_booking_cloud Stripe checks (no apps/mobile/.env), Matrix rows 8, 11, 17 skipped because of probe errors

## 6. Verify-script baseline

57/62 verify scripts failed in baseline; 5 passed. The failures were environmental, primarily because the strict password rule rejects `seed_demo.mjs` accounts using `password123` (`Invalid login credentials`, `AuthWeakPasswordError`, or seeded users not found). `verify_password_rule` passed 16/16 as expected. `verify_booking_cloud` was blocked by missing `apps/mobile/.env`; `verify_payments_webhook` was blocked by missing `whsec_test_` secrets. Full list: `baseline.md`.

## 7. Merge notes

PRs with migrations deploy to production on merge: #78 (0075), #80 (0076), #83 (0085), #86 (0070), and #88 (0071). PR #87 overlaps #79/#82; if either lands first, overlapping hunks become redundant, and its exact-error-message assertions may need updating. Nothing has merged.
