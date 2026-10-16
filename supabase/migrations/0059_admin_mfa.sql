-- Migration 0059: admin MFA rollout switch; require enrolled admins to verify a code before admin access.
-- Recovery is through another admin removing a lost factor in Supabase Studio.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.app_settings is
  'Server-side switches. RLS on with no client policies: only the service role / Studio can read or change them.';
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from public, anon, authenticated;

insert into public.app_settings (key, value)
values ('require_admin_mfa', 'false'::jsonb)
on conflict (key) do nothing;

-- Admin = has the admin role AND (session is aal2, OR has no verified MFA factor while
-- require_admin_mfa is off). An enrolled admin always needs aal2; once the switch is on, every admin does.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.user_roles
           where user_id = (select auth.uid()) and role = 'admin'
         )
     and (
           coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
           or (
                not exists (
                  select 1 from auth.mfa_factors f
                  where f.user_id = (select auth.uid()) and f.status = 'verified'
                )
            and not coalesce(
                  (select s.value = 'true'::jsonb from public.app_settings s where s.key = 'require_admin_mfa'),
                  false
                )
              )
         );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;
