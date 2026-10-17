# Mobile app inventory

Scope: the mobile app and its Supabase backend as represented in this repository snapshot. File paths below are repository-relative. Route reachability describes the intended in-app flow, not an authorization guarantee: the root stack is wrapped by `AuthGate`, mode switches are UI navigation, and database policies / Edge Function checks enforce data access. [apps/mobile/app/_layout.tsx] [apps/mobile/lib/AuthGate.tsx] [apps/mobile/lib/roleTabs.ts] [apps/mobile/lib/useRoleSwitch.ts]

## Roles

| Role / state | Grant and gate | Sources |
|---|---|---|
| Student | `handle_new_user()` inserts `user_roles.role='student'` at signup. | `supabase/migrations/0003_auth_and_campus_gate.sql`; `supabase/migrations/0002_rls.sql` |
| Tutor | `user_roles.role='tutor'` is assigned by the admin `approve-tutor` Edge Function; `tutor_profiles.approval_status='approved'` is the server-side bookability gate. A submitted/pending application can preview tutor mode but does not grant the tutor role. | `supabase/migrations/0039_student_tutor_walls.sql`; `supabase/functions/approve-tutor/index.ts`; `apps/mobile/lib/roleTabs.ts`; `packages/core/src/api/index.ts` |
| Ambassador | A user can self-add the ambassador role through `user_roles` RLS and create their own profile / referral code through `create_my_ambassador_profile()`. A separate `ambassador_approvals` row, added by the team in Studio, is required along with the role for approved-ambassador rewards/cash-out. | `supabase/migrations/0039_student_tutor_walls.sql`; `supabase/migrations/0040_noot_credits.sql`; `supabase/migrations/0051_enforce_user_status.sql`; `apps/mobile/lib/roleTabs.ts` |
| Admin | `user_roles.role='admin'` is manually assigned; the app does not offer self-grant. `is_admin()` requires that role and either an AAL2 session, or no verified TOTP factor while `app_settings.require_admin_mfa` is false (default false). Once a TOTP factor is enrolled, AAL2 is required. The mobile `AdminMfaGate` prompts for enrollment/challenge. | `supabase/migrations/0039_student_tutor_walls.sql`; `supabase/migrations/0059_admin_mfa.sql`; `packages/core/src/auth/mfa.ts`; `apps/mobile/lib/AdminMfaGate.tsx` |
| Active mode / preview | `users.active_role` selects the displayed student, tutor, or ambassador mode; it is not itself a permission. The database trigger rejects a mode the user does not hold. A submitted tutor applicant may preview tutor mode; the current mode is retained even if eligibility changes. Admin is a gated panel, not an active mode. | `supabase/migrations/0007_active_role_guard.sql`; `apps/mobile/lib/useRoleSwitch.ts`; `apps/mobile/lib/roleTabs.ts`; `apps/mobile/lib/postAuthRoute.ts` |

### Bottom tabs

The root layout declares the Expo Router stack. `TabBar` holds the tab sets; `useTabNav` mirrors the student/tutor/ambassador sets. `roleTabs.ts` controls which tutor/ambassador modes appear in the switcher and whether the profile referral card appears; it does not define tab arrays. [apps/mobile/app/_layout.tsx] [packages/ui/src/TabBar.tsx] [apps/mobile/lib/useTabNav.ts] [apps/mobile/lib/roleTabs.ts]

| Mode | Tabs |
|---|---|
| Student | Home `/home`; Search `/student_home`; Sessions `/sessions`; Chats `/chats`; Profile `/profile` |
| Tutor | Home `/tutor_home`; Calendar `/tutor_calendar`; Sessions `/tutor_sessions`; Chats `/chats`; Profile `/tutor_profile` |
| Ambassador | Home `/ambassador_home`; Referrals `/ambassador_referrals`; Profile `/profile` |
| Admin panel | Hub `/admin_home`; Calendar `/admin_calendar`; Users `/admin_users` |

## Screens and routes

All 74 top-level `apps/mobile/app/*.tsx` files are listed; `_layout.tsx` is the root layout and has no URL of its own. Roles refer to intended flow / navigation; several routes rely on a booking or onboarding draft in app state and show an empty/no-session state if opened without one.

| File / route | Intended role(s) reaching it | Purpose |
|---|---|---|
| `apps/mobile/app/_layout.tsx` (layout) | All | Initializes providers, auth gate, push handlers, and root navigation stack. |
| `apps/mobile/app/accept_terms.tsx` (`/accept_terms`) | Signed-in account that has not accepted Terms | Records Terms acceptance, then resumes post-auth routing. |
| `apps/mobile/app/admin_bookings.tsx` (`/admin_bookings`) | Admin | Browse platform bookings and disputes. |
| `apps/mobile/app/admin_calendar.tsx` (`/admin_calendar`) | Admin | Calendar of bookings and tutor interviews. |
| `apps/mobile/app/admin_chat.tsx` (`/admin_chat`) | Admin | Shared Noot-team group conversation. |
| `apps/mobile/app/admin_home.tsx` (`/admin_home`) | Admin | Admin hub with counts and links to moderation / user workflows. |
| `apps/mobile/app/admin_reports.tsx` (`/admin_reports`) | Admin | Review and resolve user-content reports. |
| `apps/mobile/app/admin_reviews.tsx` (`/admin_reviews`) | Admin | Moderate submitted reviews. |
| `apps/mobile/app/admin_tutors.tsx` (`/admin_tutors`) | Admin | Tutor application, interview, and grade-verification queues. |
| `apps/mobile/app/admin_user.tsx` (`/admin_user`) | Admin | Inspect one user's profile, status, and history. |
| `apps/mobile/app/admin_users.tsx` (`/admin_users`) | Admin | Search/filter users and change account status. |
| `apps/mobile/app/ambassador_home.tsx` (`/ambassador_home`) | Ambassador mode; preview possible when switcher allows | Ambassador credit, milestones, and invited-user dashboard. |
| `apps/mobile/app/ambassador_referrals.tsx` (`/ambassador_referrals`) | Ambassador mode; preview possible when switcher allows | Referral code, invited users, goals, and cash-out view. |
| `apps/mobile/app/auth-callback.tsx` (`/auth-callback`) | Signed-out / signing-in user following an Auth link | Exchanges the Supabase Auth callback and routes the verified session. |
| `apps/mobile/app/b1.tsx` (`/b1`) | Student | Search and filter tutors for booking. |
| `apps/mobile/app/b2.tsx` (`/b2`) | Student; tutor preview for own profile | Tutor profile selected for booking, or own tutor-profile preview. |
| `apps/mobile/app/b3.tsx` (`/b3`) | Student | Choose course, time, duration, focus, and session details. |
| `apps/mobile/app/b4.tsx` (`/b4`) | Student | Authorize payment and confirm a booking. |
| `apps/mobile/app/b5.tsx` (`/b5`) | Student | Booking confirmation and actions such as chat/session view. |
| `apps/mobile/app/blocked_users.tsx` (`/blocked_users`) | Signed-in student or tutor | Review and unblock users blocked by the current account. |
| `apps/mobile/app/c1.tsx` (`/c1`) | Student or tutor party to a completed session | Starts the role-dependent rating flow. |
| `apps/mobile/app/c2.tsx` (`/c2`) | Student | Rate the tutor and optionally write a public review. |
| `apps/mobile/app/c3.tsx` (`/c3`) | Tutor | Rate the student and optionally leave tutor/team-only feedback. |
| `apps/mobile/app/c4.tsx` (`/c4`) | Student or tutor | Confirms feedback and shows role-dependent explanation/payout detail. |
| `apps/mobile/app/chat.tsx` (`/chat`) | Student side of a conversation | Student-perspective one-to-one chat with attachments. |
| `apps/mobile/app/chat_tutor.tsx` (`/chat_tutor`) | Tutor side of a conversation | Tutor-perspective one-to-one chat with attachments. |
| `apps/mobile/app/chats.tsx` (`/chats`) | Student or tutor | List conversations and open a chat. |
| `apps/mobile/app/edit_availability.tsx` (`/edit_availability`) | Tutor / tutor applicant | Edit recurring weekly availability. |
| `apps/mobile/app/edit_courses.tsx` (`/edit_courses`) | Student | Edit courses used for the For You feed. |
| `apps/mobile/app/edit_personal.tsx` (`/edit_personal`) | Student or tutor | Edit personal profile fields. |
| `apps/mobile/app/edit_rates.tsx` (`/edit_rates`) | Tutor / tutor applicant | Edit per-course hourly rates. |
| `apps/mobile/app/edit_tutor.tsx` (`/edit_tutor`) | Tutor / tutor applicant | Edit public tutor-profile details and preview them. |
| `apps/mobile/app/enable_faceid.tsx` (`/enable_faceid`) | Newly signed-up account | Optional biometric sign-in opt-in. |
| `apps/mobile/app/forgot_password.tsx` (`/forgot_password`) | Signed-out user | Request a password-reset email. |
| `apps/mobile/app/guidelines.tsx` (`/guidelines`) | Signed-in student who has not accepted guidelines | Display and record Community Guidelines acceptance. |
| `apps/mobile/app/help.tsx` (`/help`) | Signed-in user | Static FAQs and email support contact. |
| `apps/mobile/app/history.tsx` (`/history`) | Student or tutor | Show past booking / payment or earnings history. |
| `apps/mobile/app/home.tsx` (`/home`) | Student | Student study hub, next session, and progress. |
| `apps/mobile/app/index.tsx` (`/`) | Signed-out / new user | Landing page with Log In and Sign Up. |
| `apps/mobile/app/invite.tsx` (`/invite`) | Signed-in user; ambassador features when approved | Show invite code, credit, and referral activity. |
| `apps/mobile/app/notifications.tsx` (`/notifications`) | Signed-in user | Read in-app notifications and manage push-notification permission. |
| `apps/mobile/app/profile.tsx` (`/profile`) | Student or ambassador mode | Student profile/settings and eligible role / referral actions. |
| `apps/mobile/app/role.tsx` (`/role`) | Newly verified user | Choose a starting mode and continue onboarding. |
| `apps/mobile/app/saved.tsx` (`/saved`) | Student | Saved-tutor list route; the current Sessions screen also contains a Saved segment. |
| `apps/mobile/app/sessions.tsx` (`/sessions`) | Student | Upcoming, past, and saved student sessions. |
| `apps/mobile/app/set_password.tsx` (`/set_password`) | New signup or password-recovery session | Set the account password. |
| `apps/mobile/app/signin.tsx` (`/signin`) | Signed-out returning user | Sign in with campus email and password; offers biometrics when enabled. |
| `apps/mobile/app/signup.tsx` (`/signup`) | Signed-out new user | Create an account and request campus-email verification. |
| `apps/mobile/app/standing.tsx` (`/standing`) | Tutor | Show tutor reliability / session standing. |
| `apps/mobile/app/student_home.tsx` (`/student_home`) | Student | Browse and search tutor listings by course/category. |
| `apps/mobile/app/student_profile.tsx` (`/student_profile`) | New student during onboarding | Complete the student profile. |
| `apps/mobile/app/t1.tsx` (`/t1`) | Tutor applicant | Tutor application introduction. |
| `apps/mobile/app/t2.tsx` (`/t2`) | Tutor applicant | Set tutor profile details. |
| `apps/mobile/app/t3.tsx` (`/t3`) | Tutor applicant | Choose courses to tutor. |
| `apps/mobile/app/t4.tsx` (`/t4`) | Tutor applicant | Set rates for tutor courses. |
| `apps/mobile/app/t5.tsx` (`/t5`) | Tutor applicant | Set availability. |
| `apps/mobile/app/t6.tsx` (`/t6`) | Tutor applicant | Upload transcript / grade evidence. |
| `apps/mobile/app/t7.tsx` (`/t7`) | Tutor applicant | Review and sign the tutor agreement. |
| `apps/mobile/app/t8.tsx` (`/t8`) | Tutor applicant | Configure Stripe Connect payout onboarding. |
| `apps/mobile/app/t9.tsx` (`/t9`) | Tutor applicant | Review tutor listing before submission. |
| `apps/mobile/app/t10.tsx` (`/t10`) | Submitted tutor applicant | Application submitted / in-review screen. |
| `apps/mobile/app/tb1.tsx` (`/tb1`) | Tutor | New-booking alert and student/session recap. |
| `apps/mobile/app/tb2.tsx` (`/tb2`) | Tutor | Booking/session detail with chat and calendar actions. |
| `apps/mobile/app/tutor_calendar.tsx` (`/tutor_calendar`) | Tutor mode | Tutor bookings and availability calendar. |
| `apps/mobile/app/tutor_home.tsx` (`/tutor_home`) | Tutor mode; pending applicants can preview | Tutor dashboard and management actions. |
| `apps/mobile/app/tutor_profile.tsx` (`/tutor_profile`) | Tutor mode; pending applicants can preview | Tutor profile/settings. |
| `apps/mobile/app/tutor_sessions.tsx` (`/tutor_sessions`) | Tutor mode | Upcoming and past tutor sessions. |
| `apps/mobile/app/verified.tsx` (`/verified`) | User returning from email verification | Email-verified confirmation and next onboarding step. |
| `apps/mobile/app/xbr.tsx` (`/xbr`) | Tutor receiving a booking request | Decline a pending booking request with an optional note. |
| `apps/mobile/app/xns.tsx` (`/xns`) | Student or tutor party to a session | Report the other party as a no-show. |
| `apps/mobile/app/xsc.tsx` (`/xsc`) | Student | Cancel a student booking and show refund terms. |
| `apps/mobile/app/xsr.tsx` (`/xsr`) | Student or tutor party to a rescheduled booking | Review and accept/decline a proposed time. |
| `apps/mobile/app/xtc.tsx` (`/xtc`) | Tutor | Cancel a tutor booking and show cancellation impact. |
| `apps/mobile/app/xtr.tsx` (`/xtr`) | Student or tutor party to a booking | Propose a new session time. |

## Data layer (`api.*`)

`packages/core/src/api/index.ts` is the mobile API boundary. Rows, RPCs, Edge Functions, and Storage operations below are grouped by namespace; function-side writes are detailed in the next section.

| Namespace | Reads / writes |
|---|---|
| Root (`api.getMe`, stats, booking lists, `api.createPaymentIntent`) | Reads `users`, `user_roles`, `bookings`, `tutor_profiles`; invokes `resolve-participants` for counterpart names and `create-payment-intent` for a booking hold. |
| `api.profile` | Reads/writes `users`, `user_roles`, `tutor_profiles`, `tutor_courses`, `tutor_availability`, `tutor_interviews`; uploads avatars/transcripts to Storage. Calls `sign_tutor_agreement`, `submit_tutor_application`, `set_tutor_courses`; invokes `delete-account` and `leave-tutor-role`. |
| `api.tutors` | Reads `users`, `tutor_profiles` (joined to user rows), `tutor_courses`, `tutor_availability`, `user_blocks`, and `saved_tutors`; writes `saved_tutors`. |
| `api.ambassador` | Reads `ambassador_profiles`; calls `create_my_ambassador_profile`. |
| `api.credits` | Reads `ambassador_milestones`, `credit_ledger`, `ambassador_approvals`; calls `my_invite_code`, `claim_invite`, `check_invite_code`, `my_credit_balance`, `my_invites`, `my_cashable_credit`, `request_credit_cashout`. |
| `api.admin` | Reads `tutor_profiles`, `tutor_interviews`, `reviews`, `bookings`, `users`, `content_reports`, and transcript Storage objects; updates `content_reports`; calls `schedule_tutor_interview`, `cancel_tutor_interview`, `admin_list_users`, `admin_user_history`; invokes `approve-tutor`, `admin-set-user-status`, `moderate-review`, and `resolve-dispute`. |
| `api.bookings` | Reads `bookings`; invokes `confirm-booking`, `respond-booking-request`, `cancel-booking`, `reschedule-booking`, `report-no-show`, and `complete-session`. |
| `api.connect` | Invokes `connect-onboarding-link` and `connect-status`. |
| `api.chat` | Reads/inserts `conversations`, reads `users`, `messages`, and `message_attachments`; uploads / signs `chat-attachments` Storage objects; calls `send_message_with_attachments`; subscribes to `messages` changes. |
| `api.moderation` | Inserts `content_reports`; upserts/deletes/reads `user_blocks`; calls `is_blocked_between`. |
| `api.courses` | Reads `courses` and `course_subjects` (the latter is a view). |
| `api.reviews` | Reads `reviews`; invokes `submit-rating`. |
| `api.analytics` | Inserts `analytics_events`. |
| `api.notifications` | Reads/upserts `reminder_preferences`; reads/updates `notifications`; upserts/deletes `push_tokens`. |

## Edge Functions

All directories in `supabase/functions` except `_shared` are listed. “Authenticated” means the function verifies a user JWT with `auth.getUser()` and (where shown) checks `requireActiveUser`; standard gateway JWT verification is enabled unless noted in `supabase/config.toml`. Table writes include writes performed by a called RPC or trigger when identified in code.

| Function | Purpose | Caller / auth check | Tables written |
|---|---|---|---|
| `admin-set-user-status` | Change account status and apply Auth ban/unban. | Active authenticated admin; `requireAdmin`. | `users`, `admin_actions`. |
| `approve-tutor` | Approve/reject tutor application and/or verify grades. | Active authenticated admin; `requireAdmin`. | `tutor_profiles`, `user_roles`, `users`, `admin_actions`. |
| `award-referral-bonus` | Award referral and milestone credits after completed booking. | Internal only; requires service-role bearer key; called by `complete-session`. | Via `award_invite_rewards`: `credit_ledger`. |
| `cancel-booking` | Apply cancellation/refund policy and update booking. | Active authenticated booking party; checks booking participant. | `bookings`; `credit_ledger` via `return_booking_credit`; `notifications` via `create_notification`. |
| `complete-session` | Capture held payment, transfer tutor payout, complete session, trigger referral awards. | Active authenticated booking tutor. | `bookings`, `notifications` (booking trigger); `credit_ledger` through internal referral-award RPC path. |
| `confirm-booking` | Validate booking/payment and create booking plus conversation/message. | Active authenticated student. | `bookings`, `credit_ledger`, `conversations`, `messages`; notification trigger may add `notifications`. |
| `connect-onboarding-link` | Create/reuse Stripe Connect account and payout onboarding session/link. | Active authenticated tutor. | `tutor_profiles`. |
| `connect-return` | Redirect Stripe's return/refresh browser to fixed app deep links. | No JWT (`verify_jwt=false`); no user data read. | None. |
| `connect-status` | Refresh/report Stripe payout readiness. | Active authenticated tutor. | `tutor_profiles`. |
| `create-payment-intent` | Derive server-side booking price and create manual-capture PaymentIntent (or simulated intent). | Active authenticated student. | `users` (Stripe customer ID); credit balance is read through RPC. |
| `delete-account` | Delete Auth identity, de-identify retained user record, and purge eligible messages/files. | Authenticated caller; identity comes from verified JWT and only self is acted on. | `messages`, `push_tokens`, `invite_codes`, `saved_tutors`, `tutor_profiles`, `users`; `blocked_signup_emails` through `block_signup_email`; Storage objects. |
| `leave-tutor-role` | Leave tutor role and return mode to student. | Active authenticated self. | `tutor_interviews`, `users`, `user_roles`, `tutor_profiles`. |
| `moderate-review` | Approve/reject a review and refresh tutor rating data. | Active authenticated admin; `requireAdmin`. | `reviews`, `tutor_profiles`, `admin_actions`. |
| `payments-webhook` | Handle signed Stripe Connect/account, refund, and dispute events. | Requires a Stripe signature (`STRIPE_WEBHOOK_SECRET` or Connect secret); function comment says gateway JWT verification is off, but `supabase/config.toml` has no function-specific `payments-webhook` override, so the deployed gateway setting is unclear from this repository. | `bookings`, `tutor_profiles`; `credit_ledger` via credit RPCs. |
| `release-booking-holds` | Release/cancel held PaymentIntents for expired/cancelled requests. | Internal only; service-role bearer key; `verify_jwt=false`. | `bookings`. |
| `report-no-show` | Record no-show and apply refund/payout rules. | Active authenticated booking party; caller must be the other party from the reported no-show. | `bookings`; `credit_ledger` via `return_booking_credit`. |
| `reschedule-booking` | Propose, accept, or decline a new booking time. | Active authenticated booking party; validates counterparty/action. | `bookings`; `notifications` via `create_notification`. |
| `resolve-dispute` | Flag or resolve booking dispute. | Active authenticated admin; `requireAdmin`. | `bookings`, `admin_actions`. |
| `resolve-participants` | Resolve names for a shared booking/conversation. | Active authenticated user; queries only shared counterparties. | None (reads `bookings`, `conversations`, `users`). |
| `respond-booking-request` | Accept/decline a pending request and create chat/notification. | Active authenticated tutor who owns the booking. | `bookings`, `conversations`, `messages`, `notifications`; `credit_ledger` via `return_booking_credit` on decline. |
| `submit-rating` | Upsert a party's review for a completed booking. | Active authenticated booking party. | `reviews`. |

## Tables and row-level security

Inventory of tables created in `supabase/migrations`. Every listed table has RLS enabled. Policy summary uses `S/I/U/D` for select/insert/update/delete; “none” means no direct client policy, not that service-role or trigger code cannot write. The restrictive `active_user_only` policy in `0051_enforce_user_status.sql` additionally limits authenticated access on tables where it is installed.

| Table (created in) | RLS | Policy summary (S / I / U / D) |
|---|---:|---|
| `admin_actions` (`0060_admin_audit_log.sql`) | Yes | S: active admin; I/U/D: none (service-role audit writer). |
| `ambassador_approvals` (`0040_noot_credits.sql`) | Yes | S: own user or admin; I/U/D: none (team/Studio). |
| `ambassador_milestones` (`0040_noot_credits.sql`) | Yes | S: authenticated; I/U/D: none (migration/team). |
| `ambassador_profiles` (`0001_init.sql`) | Yes | S: owner/admin; I: owner; U: owner/admin; D: none. |
| `analytics_events` (`0012_analytics_events.sql`) | Yes | S: admin; I: own user; U/D: none. |
| `app_settings` (`0059_admin_mfa.sql`) | Yes | S/I/U/D: none for clients; service role / Studio only. |
| `availability_overrides` (`0001_init.sql`) | Yes | S: authenticated; I/U/D: own tutor rows. |
| `blocked_signup_emails` (`0052_block_banned_reregistration.sql`) | Yes | S: admin; I/U/D: none for clients (server function). |
| `blocked_terms` (`0029_content_filter.sql`) | Yes | S/I/U/D: admin. |
| `bookings` (`0001_init.sql`) | Yes | S: student, tutor, or admin; I/U/D: none for clients (Edge Functions). |
| `campuses` (`0003_auth_and_campus_gate.sql`) | Yes | S: anon/authenticated for active campuses; I/U/D: none for clients. |
| `content_reports` (`0028_reports_and_blocks.sql`) | Yes | S: reporter/admin; I: reporter; U: admin; D: none. |
| `conversations` (`0001_init.sql`) | Yes | S: participants/admin; I: student opening direct chat with approved tutor; U/D: none for clients. |
| `courses` (`0020_courses.sql`; `0023_courses_public_read.sql`; `0051_enforce_user_status.sql`) | Yes | S: anon and active authenticated users (public select; authenticated access is subject to `active_user_only`); I/U/D: no client policies. |
| `credit_cashouts` (`0040_noot_credits.sql`) | Yes | S: owner/admin; I/U/D: none for clients (RPC/server). |
| `credit_ledger` (`0040_noot_credits.sql`) | Yes | S: owner/admin; I/U/D: none for clients (RPC/server). |
| `invite_code_checks` (`0050_lock_down_definer_functions.sql`) | Yes | S/I/U/D: none for clients; rate-limited definer RPC only. |
| `invite_codes` (`0040_noot_credits.sql`) | Yes | S: owner/admin; I/U/D: none for clients (RPC/server). |
| `message_attachments` (`0021_chat_attachments.sql`) | Yes | S: conversation participants/admin; I: sender of linked message; U/D: none. |
| `messages` (`0001_init.sql`) | Yes | S: conversation participants/admin; I: sender who participates, subject to block check; U/D: none for clients. |
| `notifications` (`0014_notifications.sql`) | Yes | S/U/D: owner; I: none for clients (trigger/service only). |
| `push_tokens` (`0001_init.sql`) | Yes | S/I/U/D: own user. |
| `redeemed_invite_emails` (`0040_noot_credits.sql`) | Yes | S/I/U/D: none for clients; definer/server only. |
| `referral_bonuses` (`0001_init.sql`) | Yes | S: ambassador/admin; I/U/D: none for clients. |
| `referrals` (`0001_init.sql`) | Yes | S: ambassador, referred user, or admin; I/U/D: none for clients (signup trigger/server). |
| `reminder_preferences` (`0054_session_reminders.sql`) | Yes | S/I/U: owner; D: none. |
| `reviews` (`0001_init.sql`) | Yes | S: approved review, author, or admin; I/U/D: none for clients (Edge Functions). |
| `saved_tutors` (`0004_profile_extensions.sql`) | Yes | S/I/U/D: own student rows. |
| `session_reminders_sent` (`0054_session_reminders.sql`) | Yes | S/I/U/D: none for clients; service-role reminder job only. |
| `tutor_availability` (`0001_init.sql`) | Yes | S: authenticated; I/U/D: own tutor rows. |
| `tutor_courses` (`0004_profile_extensions.sql`) | Yes | S: authenticated; I/U/D: own tutor rows (server fields also guarded). |
| `tutor_interviews` (`0042_tutor_interviews.sql`) | Yes | S: tutor owner/admin; I/U/D: none for clients (admin-checked definer RPCs). |
| `tutor_profiles` (`0001_init.sql`) | Yes | S: owner, approved profile, or admin; I: owner; U: owner/admin subject to server-field guard; D: none. |
| `tutoring_locations` (`0027_tutoring_locations.sql`) | Yes | S: anon/authenticated for active locations; I/U/D: none for clients. |
| `user_blocks` (`0028_reports_and_blocks.sql`) | Yes | S: blocker/admin; I/D: blocker; U: none. |
| `user_roles` (`0001_init.sql`) | Yes | S: owner/admin; I: own ambassador role only; D: own ambassador role or admin; U: none. |
| `users` (`0001_init.sql`) | Yes | S: self, approved tutor, or admin; U: self; I/D: none for clients. |

Four RLS-enabled tables have no client policy in the migrations: `app_settings`, `invite_code_checks`, `redeemed_invite_emails`, and `session_reminders_sent`. `courses` is not among them: `0023_courses_public_read.sql` creates a public SELECT policy, and `0051_enforce_user_status.sql` restricts authenticated access to active users. No table created in the migrations was found without RLS enabled.

### Callable SECURITY DEFINER RPCs

These functions are SECURITY DEFINER and granted to `anon` and/or `authenticated` by migrations. Trigger-only functions and functions limited to `service_role` are omitted. Being callable does not imply that every caller passes the function's internal ownership/admin checks. [supabase/migrations/0050_lock_down_definer_functions.sql] [supabase/migrations/0051_enforce_user_status.sql] [supabase/migrations/0052_block_banned_reregistration.sql] [supabase/migrations/0064_booking_cancel_noshow_tracking.sql]

| RPC (signature) | Callable role(s) | Function check / purpose |
|---|---|---|
| `check_invite_code(text)` | anon, authenticated | Rate-limited existence check for a referral code. |
| `check_signup_email(text)` | anon, authenticated | Rate-limited blocked-email check; may create an auto-flagged `content_reports` row. |
| `create_my_ambassador_profile()` | authenticated | Creates/returns the caller's own referral profile. |
| `claim_invite(text)` | authenticated | Claims a referral for the caller. |
| `my_invite_code()` | authenticated | Reads/creates the caller's invite code. |
| `my_credit_balance()` | authenticated | Returns caller's credit balance. |
| `my_cashable_credit()` | authenticated | Returns caller's approved-ambassador cashable balance (otherwise zero). |
| `my_invites()` | authenticated | Returns the caller's own invite/referral list. |
| `request_credit_cashout(int)` | authenticated | Requests a cash-out for the caller; function enforces eligibility/balance. |
| `is_active_user()` | authenticated | Returns whether the caller's account is active. |
| `is_admin()` | authenticated | Checks admin role plus configured MFA/AAL2 rule. |
| `is_approved_tutor(uuid)` | authenticated | Checks approved tutor status. |
| `is_blocked_between(uuid, uuid)` | authenticated | Checks block relationship for supplied users. |
| `is_chat_attachment_participant(text)` | authenticated | Checks whether caller participates in the conversation named by the object path. |
| `is_conversation_participant(uuid)` | authenticated | Checks whether caller belongs to the conversation. |
| `tutor_grades_verified(uuid)` | authenticated | Returns tutor grade-verification state; used by Storage/field guards. |
| `sign_tutor_agreement(text, text)` | authenticated | Records caller's tutor-agreement signature. |
| `submit_tutor_application()` | authenticated | Submits the caller's tutor application. |
| `set_tutor_courses(jsonb)` | authenticated | Saves caller's tutor courses subject to server-side checks. |
| `schedule_tutor_interview(uuid, timestamptz, text)` | authenticated | Admin-only function; checks `is_admin()`. |
| `cancel_tutor_interview(uuid)` | authenticated | Admin-only function; checks `is_admin()`. |

## Storage buckets

| Bucket | Visibility / limits | Policies |
|---|---|---|
| `avatars` | Public; 5 MiB; JPEG, PNG, WebP, HEIC, HEIF. | Public read. Authenticated owner may insert/update/delete within `{uid}/` path. |
| `transcripts` | Private; 10 MiB; PDF, JPEG, PNG, WebP, HEIC, HEIF. | Authenticated owner may read; admin may read any. Owner may insert/update/delete within `{uid}/` only until grades are verified. |
| `chat-attachments` | Private; 10 MiB; image, PDF, text, and Office document MIME types listed in migration. | Authenticated conversation participants may read/insert objects under conversation path. No client update/delete policy. |

Sources: `supabase/migrations/0011_transcripts_storage.sql`, `0013_avatars_storage.sql`, `0021_chat_attachments.sql`, `0061_storage_upload_limits.sql`, `0062_fk_indexes_rls_initplan.sql`.

## External integrations

| Integration | Code behavior | Sources |
|---|---|---|
| Stripe PaymentIntents / PaymentSheet | Student flow requests a server-priced manual-capture PaymentIntent; native PaymentSheet authorizes it. `confirm-booking` verifies the hold; session completion/cancellation/no-show handlers capture/cancel and may transfer funds. Missing Stripe secret uses simulated intents. | `apps/mobile/app/b4.tsx`; `apps/mobile/app/_layout.tsx`; `supabase/functions/create-payment-intent/index.ts`; `confirm-booking/index.ts`; `complete-session/index.ts`; `cancel-booking/index.ts` |
| Stripe Connect | Tutor onboarding creates/reuses a Connect account and Account Session; Connect status is cached in `tutor_profiles`; `connect-return` redirects back to the app. Stripe webhooks are signature-verified. | `supabase/functions/connect-onboarding-link/index.ts`; `connect-status/index.ts`; `connect-return/index.ts`; `payments-webhook/index.ts` |
| Sentry | Optional mobile reporting when `EXPO_PUBLIC_SENTRY_DSN` is set, with PII disabled and scrubbers; Edge Functions optionally report using `SENTRY_DSN` / `SENTRY_ENVIRONMENT`. | `apps/mobile/lib/sentry.ts`; `apps/mobile/lib/sentryScrub.ts`; `supabase/functions/_shared/observability.ts` |
| Push notifications (Expo) | App registers Expo device tokens in `push_tokens`; a database trigger sends notification rows to Expo's push endpoint. Push delivery is best-effort. | `apps/mobile/lib/push.ts`; `supabase/migrations/0045_push_delivery.sql` |
| Email | Supabase Auth sends signup verification / OTP and password-reset emails. The app also has a static `mailto:` support link. The configured Auth email transport/provider is unclear from the repository code. | `packages/core/src/auth/index.ts`; `apps/mobile/app/signup.tsx`; `apps/mobile/app/forgot_password.tsx`; `apps/mobile/app/help.tsx` |

## Verification scripts

One-line purposes from script comments and implementation. These scripts are inventory only; they were not run for this document.

| Script | Purpose |
|---|---|
| `scripts/verify_account_deletion.mts` | Verify account deletion behavior and retention constraints. |
| `scripts/verify_admin_audit.mts` | Verify admin mutation audit-log coverage. |
| `scripts/verify_admin_calendar.mts` | Verify admin calendar data against local Supabase. |
| `scripts/verify_admin_chat.mts` | Verify the shared admin team chat. |
| `scripts/verify_admin_mfa.mts` | Exercise admin TOTP rollout. |
| `scripts/verify_admin_user_search.mts` | Verify admin user search and filters. |
| `scripts/verify_approve_tutor_fn.mts` | Exercise the real `approve-tutor` Edge Function. |
| `scripts/verify_b2_tutor_chat.mts` | Verify tutor can open chat with a booked student. |
| `scripts/verify_backend.mts` | Exercise core auth and API against the local stack. |
| `scripts/verify_bad_language.mts` | Verify blocked-language handling. |
| `scripts/verify_banned_reregistration.mts` | Verify blocked signup after banned-account deletion. |
| `scripts/verify_booking.mts` | Verify `confirm-booking` against local Supabase. |
| `scripts/verify_booking_chat.mts` | Verify chat exists for a booked session. |
| `scripts/verify_booking_cloud.mts` | Verify booking flow against the configured cloud project. |
| `scripts/verify_booking_overlap.mts` | Verify overlapping live bookings are rejected. |
| `scripts/verify_booking_requests.mts` | Verify booking request creation/response and payment-hold behavior. |
| `scripts/verify_browse.mts` | Verify Search browse categories and Home course card. |
| `scripts/verify_campus_gate.mts` | Verify campus-email signup restrictions. |
| `scripts/verify_cancel_tiers.mts` | Verify cancellation refund tiers and authorization. |
| `scripts/verify_chat_attachments.mts` | Exercise chat attachment APIs and authorization. |
| `scripts/verify_chat_realtime.mts` | Verify live chat delivery through realtime subscription. |
| `scripts/verify_connect_return.mts` | Verify Stripe Connect return deep-link redirects. |
| `scripts/verify_course_catalog.mts` | Exercise catalog-backed course pickers. |
| `scripts/verify_credit_booking.mts` | Verify Noot credit in real booking Edge Functions. |
| `scripts/verify_credits.mts` | Verify Noot credit RPC behavior and caller boundaries. |
| `scripts/verify_currently_taking.mts` | Verify currently-taking course rules and course-specific fees. |
| `scripts/verify_db_performance.mts` | Verify foreign-key index coverage and RLS query changes. |
| `scripts/verify_definer_lockdown.mts` | Verify SECURITY DEFINER execute grants and invite-check rate limit. |
| `scripts/verify_email_code.mts` | Verify email-code signup flow. |
| `scripts/verify_filter.mts` | Verify server-side content filtering. |
| `scripts/verify_guidelines.mts` | Verify Community Guidelines acceptance is recorded. |
| `scripts/verify_interview_block.mts` | Verify tutor interviews block conflicting booking time. |
| `scripts/verify_interviews.mts` | Verify tutor interview scheduling and access. |
| `scripts/verify_launch_route.mts` | Verify post-auth launch route decisions. |
| `scripts/verify_leave_tutor_role.mts` | Verify leaving the tutor role. |
| `scripts/verify_magiclink.mts` | Verify magic-link deep-link authentication. |
| `scripts/verify_moderation.mts` | Verify report and block flows. |
| `scripts/verify_mutations.mts` | Exercise core API write methods. |
| `scripts/verify_notification_lockdown.mts` | Verify clients cannot create notifications. |
| `scripts/verify_password_auth.mts` | Verify signup verification, password creation, and sign-in. |
| `scripts/verify_password_rule.mts` | Verify Auth server password rules. |
| `scripts/verify_payments_webhook.mts` | Verify Stripe platform and Connect webhook handling. |
| `scripts/verify_payout_guards.mts` | Verify payout eligibility and guards. |
| `scripts/verify_payout_session.mts` | Verify Connect onboarding account/session flow. |
| `scripts/verify_pricing.mts` | Verify server-priced booking and eligibility rules. |
| `scripts/verify_push_tokens.mts` | Verify push-token registration and ownership. |
| `scripts/verify_realdata.mts` | Verify core APIs against real backend data rather than dummy data. |
| `scripts/verify_s1_sync.mts` | Verify app user state updates after writes without force-quit. |
| `scripts/verify_session_chat.mts` | Verify booking creates its session chat immediately. |
| `scripts/verify_session_reminders.mts` | Verify configurable session reminders. |
| `scripts/verify_sign_out.mts` | Verify sign-out ends the device session and cleans up. |
| `scripts/verify_storage_limits.mts` | Verify Storage MIME/size enforcement and client validation. |
| `scripts/verify_student_walls.mts` | Verify student/tutor role and conversation authorization boundaries. |
| `scripts/verify_t1_onboarding.mts` | Verify tutor onboarding data carries forward. |
| `scripts/verify_t4_t6_application.mts` | Verify tutor application gating, verification, and self-approval protection. |
| `scripts/verify_terms.mts` | Verify Terms acceptance recording. |
| `scripts/verify_terms_gate.mts` | Verify Terms acceptance gates app use and chat posting. |
| `scripts/verify_tutor_status.mts` | Verify tutor status lifecycle. |
| `scripts/verify_uploads.mts` | Verify avatar upload flow and ownership. |
| `scripts/verify_user_history.mts` | Verify admin user-history data and access boundaries. |
| `scripts/verify_user_status.mts` | Verify account status enforcement for existing access tokens. |
| `scripts/verify_verified_grade_lock.mts` | Verify verified tutor grades cannot be changed by the tutor. |
