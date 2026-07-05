-- 0001_init.sql — noot core schema.
--
-- Authoritative source: ARCHITECTURE.md §4 (resolved decisions), which supersedes
-- prd-data-models.md where they differ. Mirrors packages/core/src/models.
--
-- Resolved decisions baked in here:
--   • Multiple roles per account: user_roles(user_id, role) + users.active_role
--     (NOT the PRD's single role enum on Users).
--   • Reviews are ADMIN-MODERATED: subject_user_id (rated person, tutor OR student)
--     + approval_status; hidden until approved.
--   • Weekly availability + one-off overrides.
--   • Ambassador role with a flat $5 one-time referral bonus.
--
-- Schema-wide decision: every PERSON reference points to public.users(id) (= auth.uid()),
-- so every RLS policy (0002) is a direct `auth.uid() = <col>` check. tutor_profiles /
-- ambassador_profiles are 1:1 satellites keyed by user_id. This diverges from the PRD's
-- "FK -> TutorProfiles/AmbassadorProfiles" purely to keep RLS join-free.
--
-- Money: numeric(10,2) decimal dollars (matches prd-data-models.md). If the DB moves to
-- integer cents, update these columns and packages/core/models together.

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------- enums ----------
create type user_role       as enum ('student', 'tutor', 'ambassador', 'admin');
create type user_status     as enum ('active', 'suspended', 'banned');
create type approval_status as enum ('pending', 'approved', 'rejected');
create type session_type    as enum ('video', 'in_person');
create type booking_status  as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type refund_status   as enum ('not_applicable', 'refunded', 'not_refunded');
create type bonus_status    as enum ('pending', 'paid');
create type push_platform   as enum ('ios', 'android');

-- ---------- updated_at helper ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- users (base identity; id == auth.users.id) ----------
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,           -- .edu, gated in 0003
  first_name  text not null default '',
  last_name   text not null default '',
  active_role user_role not null default 'student',
  status      user_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ---------- user_roles (a user may hold several) ----------
create table user_roles (
  user_id    uuid not null references users(id) on delete cascade,
  role       user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------- tutor_profiles (1:1 with users where role=tutor) ----------
create table tutor_profiles (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null unique references users(id) on delete cascade,
  bio                       text not null default '',
  subjects                  text[] not null default '{}',
  hourly_rate               numeric(10,2) not null default 0,
  transcript_url            text,
  approval_status           approval_status not null default 'pending',  -- only 'approved' is bookable
  reviewed_by               uuid references users(id),                    -- admin
  reviewed_at               timestamptz,
  stripe_connect_account_id text,
  rating_avg                numeric(3,2),                                 -- denormalized from approved reviews
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger tutor_profiles_updated_at before update on tutor_profiles
  for each row execute function set_updated_at();

-- ---------- ambassador_profiles (1:1 with users where role=ambassador) ----------
create table ambassador_profiles (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null unique references users(id) on delete cascade,
  referral_code             text not null unique,
  stripe_connect_account_id text,
  total_referrals           int not null default 0,
  total_earned              numeric(10,2) not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger ambassador_profiles_updated_at before update on ambassador_profiles
  for each row execute function set_updated_at();

-- ---------- referrals ----------
create table referrals (
  id                 uuid primary key default gen_random_uuid(),
  ambassador_id      uuid not null references users(id) on delete cascade,   -- referring ambassador (user)
  referred_user_id   uuid not null references users(id) on delete cascade,
  referred_role      user_role not null check (referred_role in ('student', 'tutor')),
  referral_code_used text not null,
  created_at         timestamptz not null default now(),
  unique (referred_user_id)                                                  -- a user is referred at most once
);
create index referrals_ambassador_idx on referrals (ambassador_id);

-- ---------- bookings (the unit of work) ----------
create table bookings (
  id                       uuid primary key default gen_random_uuid(),
  student_id               uuid not null references users(id) on delete cascade,
  tutor_id                 uuid not null references users(id) on delete cascade,
  subject                  text not null,
  scheduled_at             timestamptz not null,
  duration_minutes         int not null,
  price                    numeric(10,2) not null,       -- total charged to student
  platform_fee             numeric(10,2) not null default 0,
  tutor_payout_amount      numeric(10,2) not null,
  session_type             session_type not null,
  meeting_link             text,                          -- when video (external link at launch)
  location                 text,                          -- when in_person
  status                   booking_status not null default 'pending',
  cancellation_deadline    timestamptz not null,          -- scheduled_at - 24h
  cancelled_at             timestamptz,
  refund_status            refund_status not null default 'not_applicable',
  stripe_payment_intent_id text,                          -- charged upfront
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index bookings_student_idx  on bookings (student_id);
create index bookings_tutor_idx    on bookings (tutor_id);
create index bookings_schedule_idx on bookings (tutor_id, scheduled_at);
create trigger bookings_updated_at before update on bookings
  for each row execute function set_updated_at();

-- ---------- referral_bonuses (flat $5, one per referral EVER) ----------
create table referral_bonuses (
  id                    uuid primary key default gen_random_uuid(),
  ambassador_id         uuid not null references users(id) on delete cascade,
  referral_id           uuid not null unique references referrals(id) on delete cascade,  -- one bonus per referral
  triggering_booking_id uuid references bookings(id) on delete set null,
  bonus_amount          numeric(10,2) not null default 5.00,   -- stored, not hardcoded
  status                bonus_status not null default 'pending',
  paid_at               timestamptz,
  created_at            timestamptz not null default now()
);

-- ---------- conversations & messages (pre-booking chat) ----------
create table conversations (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  tutor_id   uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, tutor_id)
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references users(id) on delete cascade,
  content         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);
-- NOTE: message attachments (models.MessageAttachment / Supabase Storage) deferred — not in §4 table list.

-- ---------- reviews (ADMIN-MODERATED; hidden until approved) ----------
create table reviews (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references bookings(id) on delete cascade,  -- one review per booking
  reviewer_id     uuid not null references users(id) on delete cascade,
  subject_user_id uuid not null references users(id) on delete cascade,            -- the person being rated
  rating          int not null check (rating between 1 and 5),
  comment         text,
  approval_status approval_status not null default 'pending',
  reviewed_by     uuid references users(id),                                        -- admin
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index reviews_subject_approved_idx on reviews (subject_user_id) where approval_status = 'approved';

-- ---------- tutor_availability (recurring weekly windows) ----------
create table tutor_availability (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);
create index tutor_availability_tutor_idx on tutor_availability (tutor_id);

-- ---------- availability_overrides (one-off open/close per date) ----------
create table availability_overrides (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references users(id) on delete cascade,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  is_open    boolean not null,                    -- true = opened, false = blocked
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);
create index availability_overrides_tutor_idx on availability_overrides (tutor_id, date);

-- ---------- push_tokens ----------
create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token      text not null,
  platform   push_platform not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
