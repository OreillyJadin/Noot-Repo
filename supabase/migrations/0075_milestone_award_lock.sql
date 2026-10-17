-- 0075: ambassador milestones are paid even when two invite rewards land at once.
--
-- award_milestones counted the ambassador's rewards with no lock, so two transactions each
-- adding a reward (two invitees' sessions completed together, or approval racing a reward)
-- each saw only their own new row and both stopped short of the goal: e.g. 3 rewards
-- committed + 2 in flight = 5 rewards and no 5-invite bonus. Take the per-user credit lock
-- first; the count then runs after the other transaction commits and sees its reward.
create or replace function award_milestones(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  done int;
begin
  perform credit_lock(p_user);
  if not is_approved_ambassador(p_user) then
    return;
  end if;
  select count(*) into done
    from credit_ledger l left join bookings b on b.id = l.booking_id
   where l.user_id = p_user and l.kind = 'invite_reward' and b.credit_reversed_at is null;
  insert into credit_ledger (user_id, amount_cents, kind, milestone)
  select p_user, m.bonus_cents, 'milestone_bonus', m.threshold
    from ambassador_milestones m where m.threshold <= done
  on conflict (user_id, milestone) where kind = 'milestone_bonus' do nothing;
end $$;
revoke execute on function award_milestones(uuid) from public, anon, authenticated;
grant execute on function award_milestones(uuid) to service_role;
