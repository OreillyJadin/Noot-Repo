-- 0012_analytics_events.sql
-- Lightweight, append-only analytics event log. First consumer: role-switch tracking
-- (recruitment-rate analytics — how often students turn on the tutor/ambassador mode).
--
-- The client fires these fire-and-forget: a failed insert must NEVER block the action
-- that produced it (see api.analytics.track — it swallows errors). So this table is
-- deliberately permissive on insert (owner-only) and strict on read (admin-only).

create table if not exists analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  event      text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_idx on analytics_events (event, created_at desc);
create index if not exists analytics_events_user_idx  on analytics_events (user_id, created_at desc);

alter table analytics_events enable row level security;

-- Owner may append their own events; no client update/delete (append-only log).
drop policy if exists analytics_events_insert_own on analytics_events;
create policy analytics_events_insert_own on analytics_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Reads are admin-only (dashboards use the service role, which bypasses RLS anyway).
drop policy if exists analytics_events_admin_read on analytics_events;
create policy analytics_events_admin_read on analytics_events
  for select to authenticated
  using (is_admin());

-- PostgREST data-API grants (RLS above is still the real gate — see 0005).
grant select, insert on analytics_events to authenticated;
grant all on analytics_events to service_role;
