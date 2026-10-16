# Edge Functions

Server-only logic (ARCHITECTURE.md §5). Planned functions:

| Function | Purpose |
|---|---|
| `create-payment-intent` | Held (manual-capture) Stripe PaymentIntent for B4. *(skeleton exists)* |
| `stripe-webhook` | payment/connect/refund events. |
| `confirm-booking` | Create booking on payment success, seed chat with B3 intro message. |
| `connect-onboarding-link` | Tutor Stripe Connect onboarding. |
| `complete-session` | Capture payment, transfer payout to tutor. |
| `submit-rating` | Double-blind rating visibility. |
| `cancel-booking` | 12h / 2h student refund tiers; transfers the tutor's share on late cancellations. |
| `reschedule-booking` | Propose/accept new time; 3-reschedule rule. |
| `report-no-show` | No-show thresholds + 3-strike escalation. |
| `auto-complete` (cron) | 24h no-response → auto-complete + release. |
| `send-reminders` (cron) | 24h + 1h session reminders. |
| `leave-tutor-role` | Remove the tutor role and reset the application for a future re-application. |

## Stripe Connect return address (ERR-002)

Stripe live mode only accepts https return URLs, so `connect-onboarding-link` sends tutors
back to the `connect-return` function, which redirects into the app (`noot://connect-return`).

- **Deploy order:** `connect-return` must be live **with JWT verification off** before (or
  with) `connect-onboarding-link`. `supabase functions deploy connect-return` from the repo
  picks that up from `config.toml`; any other deploy path must pass `verify_jwt: false`, or
  Stripe returns the tutor to a 401 page that never closes.
- **Local:** inside the local stack `SUPABASE_URL` is an internal address a phone can't
  reach. Set `CONNECT_RETURN_BASE_URL` in the functions env (e.g. your tunnel or LAN URL for
  the API on :54321) to test the full return on a device.

## Admin audit log (0060)

Every admin mutation leaves one row in `public.admin_actions`
(`actor_id`, `action`, `target_type`, `target_id`, `details`, `created_at`). Edge Functions
write it via `_shared/audit.ts` (`logAdminAction`, which never throws — the action already
happened); `schedule_tutor_interview` / `cancel_tutor_interview` insert inside their own
transaction; and `log_admin_write()` triggers catch the direct client writes that
`is_admin()` RLS allows (`content_reports`, `user_roles`, `tutor_profiles`,
`ambassador_profiles`, `blocked_terms`). Trigger rows only appear when the writer is a
signed-in admin editing someone else's row, so service-role writes are never double-logged.

Action names: `user.suspend` / `user.ban` / `user.reactivate`, `tutor.approve` /
`tutor.reject` / `tutor.verify_grades`, `review.approve` / `review.reject`, `dispute.flag` /
`dispute.resolve`, `interview.schedule` / `interview.cancel`, `report.actioned` /
`report.dismissed`, `user_role.remove`, `tutor_profile.update` / `ambassador_profile.update`,
`blocked_term.add` / `blocked_term.update` / `blocked_term.remove`.

The table is **append-only**: admins get SELECT; nobody — not even service_role — can
UPDATE or DELETE, so only the postgres role (SQL editor / Studio) can remove rows. `details`
carries identifiers and changed column names only, never secrets, transcript paths, bios or
message text. To see everything an admin did to one user:

```sql
select a.created_at, actor.email as admin, a.action, a.target_type, a.target_id, a.details
from public.admin_actions a
join public.users actor on actor.id = a.actor_id
where (a.target_type = 'user' and a.target_id = '<user-uuid>')
   or a.details->>'subject_user_id' = '<user-uuid>'
   or a.details->>'student_id' = '<user-uuid>'
   or a.details->>'tutor_id' = '<user-uuid>'
order by a.created_at desc;
```
