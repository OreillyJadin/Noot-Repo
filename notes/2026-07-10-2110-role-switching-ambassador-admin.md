# Worklog — Role-switching + Ambassador + Admin build-out

**Started:** 2026-07-10 21:10 UTC · **Branch:** main · **Author:** Jadin (+ Claude)

Rolling notes for this workstream: findings, decisions, and a timestamped log of what we
actually did. Planning deliverable lives here; per-phase code lands in commits.

---

## Goal

Build the **Ambassador dashboard** and **Admin panel** in `apps/mobile`, on top of a
**role-switching** foundation (users can be student + tutor + ambassador simultaneously;
admin is a separate Noot-team permission, not a switchable mode).

## Key findings (verified against code/migrations 2026-07-10)

**Nav architecture (decision):** Neither "swap whole stack" nor "one re-themed home."
- `app/_layout.tsx` is a **flat `<Stack>` of sibling routes** — no expo-router `Tabs`/groups.
  The tab bar is a custom `packages/ui/TabBar.tsx` that does `router.replace('/'+key)`.
- App **already ships parallel per-role screen sets** (student vs tutor) selected by `TabBar`'s
  `role` prop; switching today = `setRole()` + `router.replace()` to the role's home.
- **Decision:** persist a single `activeRole` (→ `users.active_role`, currently in-memory only);
  keep role-specific homes/tabs (add ambassador set); keep shared flows (chat/booking/detail)
  single-instance; **consolidate Profile** (host the switcher there); persistent "Viewing as"
  indicator; **admin = gated section off Profile**, not in the switcher.
- Caveat: flat sibling routes give **weak route guarding** — add a lightweight active-role guard
  on role-specific roots.

**Data-model gaps:**
- ✅ `user_roles` multi-role solid; RLS self-grants non-admin, blocks admin (`0002:55-56`).
- ✅ `is_admin()` + admin `SELECT` policies already exist across tables (admin reads work).
- 🟡 `users.active_role` column exists (`0001:48`), **no client write path** (only seed sets it).
- 🟡 `users.status` exists, **not enforced** anywhere.
- 🔴 `tutor_profiles.approval_status` — **tutor can self-approve** (RLS `user_id=auth.uid()`, `0002:65`). CRITICAL.
- 🟡 `ambassador_profiles`/`referrals`/`referral_bonuses` tables exist, **no logic/API/UI**.
  (`referral_bonuses.referral_id` unique blocks dup bonuses; no self-referral CHECK; no signup attribution.)
- 🔴 Transcript upload = stub (`t6.tsx` dropzone no-op; no Storage bucket).
- 🔴 Booking disputes = no schema (`submit-rating` `happened===false` is a bare TODO).
- 🔴 `moderate-review` not built (reviews stay `pending` forever).

**Existing edge functions:** cancel-booking, confirm-booking, create-payment-intent,
report-no-show, reschedule-booking, resolve-participants, submit-rating.
**Not built:** approve-tutor, moderate-review, award-referral-bonus, admin-set-user-status, resolve-dispute.
Copy the server-action pattern from `supabase/functions/submit-rating/index.ts`.

## Security items → route to security-reviewer (as each is built)

1. `active_role` write guard (client-writable column; must be a held, non-admin role).
2. **Tutor self-approval RLS gap** (critical) — column-hardening trigger + `approve-tutor` sole writer.
3. All admin writes server-side (client `is_admin` is UI-only).
4. Admin role-grant stays RLS-blocked.
5. Referral fraud (self-referral, dup bonuses, code guessability).
6. Referral capture in the `SECURITY DEFINER` auth trigger (`handle_new_user`, `0003`).
7. `users.status` actually enforced (login/RLS).
8. Dispute-model RLS (admin-write, participant-read).
9. Transcript Storage RLS (owner-write, admin-read, not public).

## Phased plan

- **Phase 0 — role-switching foundation (blocks all):** widen mobile `Role`; `setActiveRole` +
  server guard; `<RoleSwitcher>`/`<ViewingAs>`; consolidate Profile; gated admin entry; ambassador
  tab set + home shell.
- **Phase 1 — ambassador:** referral schema/anti-fraud; code generation; `api.ambassador.*`;
  share screen; dashboard; `award-referral-bonus` fn.
- **Phase 2 — admin:** schema hardening (self-approve trigger, dispute model, status enforcement);
  edge fns (approve-tutor, moderate-review, admin-set-user-status, resolve-dispute); transcript
  upload; `api.admin.*`; admin screens.

---

## Doings log

### 2026-07-10 21:10 UTC — scoping complete
- Planner subagent scoped the work; verified findings against migrations `0001`–`0006`, RLS `0002`,
  `_layout.tsx`, `TabBar.tsx`, `role.tsx`, `postAuth.ts`. Recorded above.
- Confirmed the Phase 0 touch-points: `apps/mobile/lib/store.tsx` (`Role='student'|'tutor'`),
  `apps/mobile/lib/postAuth.ts:26-30` (ambassador→student downcast), `packages/ui/src/TabBar.tsx`
  (`STUDENT`/`TUTOR` arrays, `role?: 'student'|'tutor'`).

### 2026-07-10 21:40 UTC — Phase 0 COMPLETE (role-switching foundation)
All 6 subtasks done; `pnpm -r typecheck` clean; guard trigger verified on local.
- **0.1** `store.tsx` `Role` → `student|tutor|ambassador`; `postAuth.ts` routes ambassador → `/ambassador_home`.
- **0.2** core `api.profile.setActiveRole()` + `addRole()`; migration `0007_active_role_guard.sql`
  (trigger: active_role must be a role the user holds). Applied to **local**.
- **0.3** `packages/ui/RoleSwitcher.tsx` — `<RoleSwitcher>` (segmented, hides if <2 roles) + `<ViewingAs>` pill; exported.
- **0.4** `lib/useRoleSwitch.ts` (persist + swap home); wired into `profile.tsx` + `tutor_profile.tsx`
  (switcher + "Become an ambassador" add-role; tutor's "Switch to student" replaced by the switcher).
- **0.5** Gated **Noot Admin** entry on both profiles (only if `me.roles.includes('admin')`) → `admin_home.tsx`
  (shell + client guard; sections are Phase-2 stubs). Not in the switcher.
- **0.6** `TabBar` AMBASSADOR set (Home+Profile shell) + `role` union widened; `ambassador_home.tsx` shell
  with `<ViewingAs>`; routes registered in `_layout.tsx`. `<ViewingAs>` added to `home`/`tutor_home` headers (multi-role only).
- **Decision (deviation from planner):** the guard trigger does NOT hard-block `active_role='admin'` — it
  only requires the role be held. Rationale: `is_admin()` reads `user_roles` not `active_role` (so admin mode
  grants no power), and a blanket block would break the service-role admin seed. Recorded for security-reviewer.
- **Verified (local):** student-only account → `setActiveRole('tutor')` rejected by trigger ✅;
  `addRole('ambassador')`+`setActiveRole('ambassador')` persists ✅. (Side effect: local `student1@` now also
  holds ambassador — handy multi-role test account.)
- **NOT yet on cloud:** migration `0007` is local-only; `active_role` writes work on cloud via RLS but the
  guard trigger isn't there until we `supabase db push`. Pending user go-ahead (+ commit).
- **⚠️ For security-reviewer (Phase 0 surface):** `setActiveRole`/`active_role` guard (0.2), admin entry is
  UI-only gate (0.5) — real enforcement is Phase 2 server-side, `addRole` relies on RLS blocking `admin`.
- **Next:** Phase 1 (ambassador) — after user confirms Phase 0 + whether to push `0007`/commit.

### 2026-07-10 22:35 UTC — Phase 0 pushed to cloud + committed
- Migration `0007` applied to **cloud** via MCP `apply_migration`; cloud guard verified (student-only
  account → `setActiveRole('tutor')` rejected). Committed Phase 0 as `961e731` (local; not pushed to origin).

### 2026-07-10 23:10 UTC — Phase 1 COMPLETE (ambassador program) — local-verified
- **1.1** migration `0008_ambassador.sql`: self-referral CHECK; `handle_new_user` captures a
  `referral_code` from signup metadata (silently ignored if bad — never breaks signup);
  `create_my_ambassador_profile()` (SECURITY DEFINER) generates a unique `NOOT-XXXXXX` code. Applied to local.
- **1.2** edge fn `list-referrals` (service role) — caller's referrals + referred names + pipeline
  status (signed_up → bonus_pending → bonus_paid) + totals. Solves the users_select RLS wall like resolve-participants.
- **1.3** core `api.ambassador.ensureProfile()` (rpc) / `getProfile()` / `listReferrals()` (invoke); new
  `AmbassadorReferrals`/`AmbassadorReferralRow` types exported from core root.
- **1.4** `ambassador_referrals.tsx` — code + link + RN `Share` sheet + "how it works". Referrals tab restored to the ambassador set.
- **1.5** `ambassador_home.tsx` dashboard — total-earned summary + referred-user pipeline (status badges) + empty state.
- **1.6** edge fn `award-referral-bonus` (service role, idempotent, fraud-guarded) — **ready but NOT
  triggered yet** (needs the unbuilt `complete-session`); flagged. Seed populates bonuses directly instead.
- **Seed:** `seed_cloud.mjs` now seeds ambassador@ (code `NOOT-DEMO01`) + 3 referrals with a full
  pipeline: Riley=paid, Jordan=pending, Priya=signed-up.
- **Verified (local, after `supabase stop/start` to serve the new fns):** `pnpm -r typecheck` clean;
  ambassador flow → code `NOOT-DEMO01`, totals `{referrals:3, bonusesEarned:1, totalEarned:5}`,
  pipeline `Riley:bonus_paid  Jordan:bonus_pending  Priya:signed_up`; web export bundles.
- **⚠️ security-reviewer (Phase 1 surface):** `handle_new_user` referral capture (auth trigger),
  self-referral CHECK, `create_my_ambassador_profile` code-gen, `list-referrals` (only returns caller's own),
  `award-referral-bonus` (unique referral_id = one bonus ever; booking must be completed).
- **NOT yet on cloud:** migration `0008`, edge fns `list-referrals` + `award-referral-bonus`, and the
  referral seed. Cloud ambassador dashboard will 500 on `list-referrals` until deployed. Pending user go-ahead.
- **Deferred (noted, not dummy data):** signup screen doesn't yet collect a referral code (trigger supports
  it); `award-referral-bonus` needs wiring to a real completion flow (Stripe workstream).

### 2026-07-11 00:05 UTC — Phase 1 deployed to cloud + security review
- Pushed `961e731`+`b39adef` to origin. Cloud: `0008` applied (MCP), `list-referrals` +
  `award-referral-bonus` deployed, re-seeded. Cloud ambassador flow verified: code `NOOT-DEMO01`,
  totals `{referrals:3, bonusesEarned:1, totalEarned:5}`, pipeline paid/pending/signed-up.
- **Security review (Phase 0+1)** — ran against `afe6fdc..HEAD` diff (skill auto-diff was empty since
  committed). **1 MEDIUM finding, rest clean.**
  - MEDIUM `broken_access_control` — `award-referral-bonus` had **no caller auth** (deviated from the
    submit-rating pattern): any authenticated JWT could trigger bonus creation for arbitrary
    completed+referred bookings. Low impact today (bonuses legit + `pending` + deduped, no real payout),
    but a financial-mutation endpoint with no authz. **FIXED:** now requires the service-role key as
    bearer (internal-only); redeployed; verified anon token → 403.
  - Clear: `0007` active_role trigger, `list-referrals` (caller-scoped), `create_my_ambassador_profile`,
    `handle_new_user` referral capture (parameterized; self-referral CHECK). Noted low/anti-abuse:
    referral attribution can be spoofed via signup metadata (gaming, needs a real paid session; not a
    security vuln) — revisit in an anti-abuse pass.
  - Admin gating is UI-only by design; no admin WRITE actions exist yet (Phase 2 adds them server-side).
- **Next:** Phase 2 (Admin panel), starting with schema hardening (the tutor self-approve RLS gap is the
  critical item) + the tutor approval flow.

### 2026-07-11 00:40 UTC — Phase 2 part 1: tutor approval flow (local + cloud)
- **2.1** migration `0009_tutor_approval_guard.sql` — trigger blocks any non-service-role write to
  tutor_profiles.approval_status/reviewed_by/reviewed_at (closes the tutor self-approve RLS gap).
  Applied local + cloud. Verified: tutor changing an approval field → BLOCKED; benign bio edit → allowed.
- **2.2** edge fn `approve-tutor` (service role; re-verifies caller `is_admin` server-side; only writer of
  approval fields) + `api.admin.listPendingTutors()` / `approveTutor()`; `PendingTutor` type exported. Deployed to cloud.
- **2.3** `admin_tutors.tsx` — pending-tutor queue with transcript link + approve/reject; wired from
  `admin_home` (Tutor approvals row); route registered.
- **Verified end-to-end on CLOUD:** non-admin `approveTutor` → rejected; admin `listPendingTutors` finds a
  pending tutor; admin `approveTutor` → `{ok, approvalStatus:'approved'}`. Typecheck clean; web export bundles.
- **Remaining Phase 2 (next chunk):** user management (`admin-set-user-status` + `admin_users`), booking
  disputes (`booking_disputes` model + `resolve-dispute` + `admin_bookings`), review moderation
  (`moderate-review` + `admin_reviews`), transcript upload (Storage bucket + `t6`).
- **⚠️ security-reviewer (Phase 2 part 1):** `0009` approval-field trigger (service-role-only), `approve-tutor`
  (server-side is_admin re-check — the pattern for all admin write fns).
