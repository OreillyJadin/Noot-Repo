# Mobile app audit test plan

Plan for the mobile QA audit described in the supplied audit brief. The feature and route reference is [`APP_INVENTORY.md`](APP_INVENTORY.md). Test only behavior present in the inventory; mark absent behavior not applicable and record unclear rules without guessing. This file defines coverage, not execution results.

## Scope and boundaries

**In scope:** Student and tutor Android/API journeys (A/B); ambassador/referral/credit API and database behavior (C); Supabase RLS, RPC, Storage, race, and `verify_*` checks (D); and the iOS simulator critical journeys (E).

**Out of scope:** Web; push-notification delivery in Expo Go; real-card PaymentSheet; production writes; live Stripe. PaymentIntents are simulated (no Stripe key in Functions), except where a workstream explicitly uses `sk_test`. No live Stripe or production writes.

## Environment and test data

| Surface | Settled test environment |
|---|---|
| iOS | macOS VM; iPhone 17 simulator on iOS 26.5; Expo Go. |
| Backend | Local Supabase CLI 2.120.0 and Edge Functions on a Linux VM, exposed through a Cloudflare quick tunnel. The macOS VM has no hypervisor (`kern.hv_support 0`) or Docker; Supabase Management API project creation returned 403. |
| Android | Emulators on separate Linux VMs; each VM runs its own local Supabase stack. |
| Payments and data safety | Simulated PaymentIntents unless a workstream explicitly uses `sk_test`; no live Stripe and no production writes. Use synthetic accounts and data. |

Primary users: `alex.rivera@crimson.ua.edu` (student) and `sara.chen@crimson.ua.edu` (tutor), plus synthetic accounts for each workstream. Test-user data comes from `scripts/e2e_users.mts` on branch `chore/e2e-test-helpers` and `supabase/seed_courses.json`. Do not use `supabase/seed_demo.mjs`.

## Workstreams

| ID | Assignment |
|---|---|
| A | Student experience: Android and API. |
| B | Tutor and Admin experience: Android and API. |
| C | Ambassador, referrals, and credit: API and database. |
| D | Supabase security and data integrity: RLS, RPC, Storage, races, and `verify_*` scripts. |
| E | iOS simulator critical journeys: booking-to-chat E2E; cancel/no-show screens; keyboard and special characters; background/foreground; Dynamic Type XXXL; dark appearance. |

For D, use separate authorized role accounts to verify row-level SELECT/INSERT/UPDATE/DELETE, RPC grants and internal ownership/role checks, Storage object access, and race invariants against actual backend responses and persisted state. Never disable RLS to make a test pass.

## Role × feature-area workstream matrix

Cells identify assigned workstreams; `—` means no role-specific workstream assignment. D is included where backend ownership, authorization, or integrity is exercised.

| Feature area | Student | Tutor | Ambassador | Admin |
|---|---|---|---|---|
| Auth | A, D | B, D | C, D | B, D |
| Onboarding | A, D | B, D | C, D | — |
| Discovery | A, D | B, D | — | B, D |
| Booking | A, D, E | B, D, E | — | B, D |
| Payments | A, D | B, D | C, D | B, D |
| Credits | C, D | — | C, D | D |
| Messaging | A, D, E | B, D, E | — | B, D |
| Notifications | A, D | B, D | C, D | B, D |
| Sessions lifecycle | A, D, E | B, D, E | — | B, D |
| Ratings | A, D | B, D | — | B, D |
| Settings/privacy | A, D | B, D | C, D | B, D |
| Account deletion | A, D | B, D | C, D | — |
| Admin | — | — | — | B, D |
| Ambassador | C, D | C, D | C, D | D |

## Test types by feature area

Apply the relevant scenario classes to each in-scope feature. Check actual persisted state and backend authorization where applicable; do not treat client-side visibility as an access control.

| Area | Planned scenario types |
|---|---|
| Auth | Happy sign-up/sign-in/sign-out/session restore; invalid credentials and verification; password/input boundaries; duplicate registration/submission; unauthorized role access; offline and expired-session recovery; auth callback/deep link/back navigation; accessibility labels and focus. |
| Onboarding | Valid completion and persistence; missing/invalid fields and input boundaries; repeated submission; wrong-role access; offline/expired session; back/direct entry; keyboard, labels, and large text. |
| Discovery | Search/filter happy paths, empty/error results, query boundaries, repeated searches, unapproved/private tutor access, offline recovery, route entry/return, accessibility and text overflow. |
| Booking | Supported request/confirmation flow; invalid or unavailable choices; time/price boundaries; repeated submission and overlapping-booking races; other-user ownership; offline/expired session; back/deep link; keyboard and accessible controls. |
| Payments | Simulated authorization/confirmation and supported failure paths; amount/credit boundaries; repeated submit and duplicate intent handling; booking ownership; offline/expired session; navigation interruption; accessibility. No real-card PaymentSheet. |
| Credits | Earn/redeem/referral happy paths; invalid codes and self-referrals; amount/milestone boundaries; duplicate claims and concurrent redemption; ledger/attribution ownership; offline/expired session; referral links; accessibility. |
| Messaging | Send/open-thread happy paths; empty, long, special-character, and failed sends; duplicate/concurrent submission; participant-only access; offline/retry and expired session; chat deep links; keyboard, labels, and touch targets. |
| Notifications | In-app notification creation/read and destination route; empty/error states and repeated events; per-user authorization; offline/expired session; supported deep links; accessible labels. Expo Go push delivery is excluded. |
| Sessions lifecycle | Applicable accept/decline, reschedule, cancel, no-show, current/past flows; invalid transitions and endpoint-defined timing boundaries; duplicate actions and competing updates; party ownership; offline/expired session; route/deep link; keyboard and accessibility. |
| Ratings | Supported submit/moderation flow; invalid or ineligible submission; text boundaries; duplicate/upsert behavior; author/admin authorization; offline/expired session; navigation; accessibility. Mark absent paths not applicable. |
| Settings/privacy | Save/reopen supported profile or preference changes; invalid/boundary values; repeated saves; self/role/admin authorization; offline/expired session; back/direct route; keyboard, large text, and labels. |
| Account deletion | Synthetic local-account flow only; confirm/cancel, related-data boundaries, repeated/concurrent requests, other-user denial, offline/expired session, navigation and accessibility. Never run against production. |
| Admin | Authorized MFA-gated entry and supported user/tutor/moderation actions; invalid states and filter boundaries; repeated/racing mutations; non-admin direct-route/API denial; expired/AAL session; deep links; accessibility. |
| Ambassador | Referral/profile/dashboard happy paths; invalid/self-referral; threshold boundaries; duplicate attribution and reward races; ownership and role checks; offline/expired session; invite-link navigation; accessibility. |

## End-to-end journeys

1. **Student (A, D; E on iOS):** Sign up/sign in, complete applicable onboarding, discover a tutor, start the supported booking flow, verify the booking through API/database evidence, open the resulting chat, and verify persistence after navigation or app restart.
2. **Tutor and Admin (B, D):** Sign in as tutor, complete supported profile/setup and availability steps, manage a student booking, then verify the student-facing state. Separately enter admin through its MFA gate and exercise supported review/user workflows; confirm ordinary roles cannot access admin routes or APIs.
3. **Ambassador (C, D):** Sign in, obtain a referral link/code, use a separate synthetic account for the applicable referral flow, and verify attribution, dashboard values, and credit/ledger effects. Exercise invalid, self, duplicate, and concurrent referral cases.
4. **iOS critical journeys (E):** On the stated iPhone simulator, run booking-to-chat and cancel/no-show screen journeys; exercise keyboard and special-character input, background/foreground return, Dynamic Type XXXL, and dark appearance. Record any journey not actually executed as blocked or unverified.

## Entry and exit criteria

**Entry**

- Use [`APP_INVENTORY.md`](APP_INVENTORY.md) to select discovered routes, roles, APIs, and policies; baseline failures are separated from audit regressions.
- Confirm the intended local stack/tunnel and synthetic account for the workstream before writing or mutating test data.
- Identify the expected behavior from code/API rules; record unclear behavior instead of inventing a result.
- Assign each case a role, feature area, workstream, platform, and evidence location before execution.

**Exit**

- Every applicable role × feature-area cell has an execution status or an explicit blocker/not-applicable reason; untested scenarios and platform gaps are recorded.
- Core journeys and relevant negative/security cases have API/database evidence where applicable; UI-only checks are identified as such.
- Confirmed Critical/High defects are fixed and regression-tested where safe, or explicitly left unresolved with evidence and an owner/action.
- Relevant automated tests, `verify_*` checks, and builds are recorded; rerun affected checks after fixes. Compilation alone is not audit completion.
- No production writes, live Stripe actions, or unreported high-impact regressions.

## Recording results

- Record each case in `docs/qa/TEST_RESULTS.md` with ID, role, area, workstream, platform, environment/build, steps, expected/actual, status (`pass`, `fail`, `blocked`, `skipped`, or `not applicable`), and evidence path. Put execution counts only in that results file.
- Record confirmed issues in `docs/qa/DEFECT_REGISTER.md`: unique ID, affected role/environment, reproduction, expected vs. actual, severity, evidence, root cause, fix/regression test, and verification status.
- Keep screenshots/logs with the audit evidence and link them from the corresponding result or defect. Distinguish simulator, emulator, API, database, automated-test, and source-inspection evidence.
