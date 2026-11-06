alter table public.bookings
  add column no_show_claim_party text check (no_show_claim_party in ('student', 'tutor')),
  add column no_show_claimed_by uuid references public.users(id) on delete set null,
  add column no_show_claimed_at timestamptz,
  add column no_show_contested_at timestamptz,
  add column no_show_contest_note text,
  add column completion_claimed_at timestamptz,
  add column completion_objected_at timestamptz,
  add column completion_objection_note text,
  add column attendance jsonb;

create index bookings_no_show_claims_due_idx
  on public.bookings (no_show_claimed_at)
  where no_show_claimed_at is not null and status = 'confirmed';

create index bookings_completion_claims_due_idx
  on public.bookings (completion_claimed_at)
  where completion_claimed_at is not null and status = 'confirmed';

create index bookings_no_show_claimed_by_idx
  on public.bookings (no_show_claimed_by);
