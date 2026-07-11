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
