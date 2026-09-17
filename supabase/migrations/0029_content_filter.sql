-- Server-side objectionable-content filter (APP_REVIEW_TICKETS.md T4, Guideline 1.2).
--
-- The reply to App Review states "Messages are filtered server-side for objectionable
-- language." Before this migration nothing checked message text at all:
-- send_message_with_attachments (0021) inserted p_content raw, and confirm-booking
-- inserts an opening message as service role, bypassing RLS entirely.
--
-- Enforced as BEFORE INSERT/UPDATE triggers rather than inside the RPC, so EVERY writer
-- is covered — the RPC, a direct client insert, and a service-role insert alike. That is
-- the whole point: a filter a caller can route around is not a filter.

-- ---------- the list, in exactly one place ----------
create table if not exists blocked_terms (
  term       text primary key,
  -- 'slur' terms are the zero-tolerance set; 'harassment' covers threats and abuse.
  category   text not null default 'slur',
  created_at timestamptz not null default now()
);

comment on table blocked_terms is
  'Single source of truth for the Guideline 1.2 content filter. Matched case-insensitively on word boundaries by contains_blocked_term(). Admin-managed; never client-writable.';

alter table blocked_terms enable row level security;
-- Deliberately no policy for `authenticated`: the list itself must not be readable by
-- users (it is a roadmap for evasion) and must not be editable by them. The filter
-- function is SECURITY DEFINER so it can read the table without granting anyone select.
drop policy if exists blocked_terms_admin_all on blocked_terms;
create policy blocked_terms_admin_all on blocked_terms for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- the check ----------
-- Word-boundary matched (\m ... \M) and case-insensitive. Substring matching would reject
-- innocent words that merely contain a blocked term, which is a worse failure than a miss.
create or replace function public.contains_blocked_term(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select t.term
  from blocked_terms t
  where p_text is not null
    and p_text ~* ('\m' || regexp_replace(t.term, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M')
  limit 1;
$$;

comment on function public.contains_blocked_term(text) is
  'Returns the first blocked term found in p_text, or null. SECURITY DEFINER so callers need no select on blocked_terms.';

-- ---------- enforcement ----------
-- One friendly, catchable error. The client surfaces .message directly, so this string is
-- user-facing copy — @noot/core reads the Edge Function / Postgres error body (T13).
-- The column to check is passed as a trigger argument and read via to_jsonb, NOT with a
-- CASE over new.content / new.bio / new.comment: plpgsql compiles every branch of such a
-- CASE, so referencing a column the triggering table doesn't have fails at runtime with
-- 'record "new" has no field ...'. to_jsonb keeps one function usable on all three tables.
create or replace function public.reject_blocked_content()
returns trigger language plpgsql as $$
declare
  col text := tg_argv[0];
  hit text;
  val text;
begin
  val := to_jsonb(new) ->> col;

  -- On UPDATE, only re-check when the text actually changed, so tightening the list
  -- doesn't block unrelated edits to old rows.
  if tg_op = 'UPDATE' and val is not distinct from (to_jsonb(old) ->> col) then
    return new;
  end if;

  hit := public.contains_blocked_term(val);
  if hit is not null then
    -- Deliberately neutral wording: this same trigger guards chat messages, tutor bios
    -- and review comments, so "message" would read wrong on two of the three.
    raise exception 'That wording breaks our community rules. Please revise it and try again.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_content_filter on messages;
create trigger messages_content_filter
  before insert or update of content on messages
  for each row execute function public.reject_blocked_content('content');

drop trigger if exists tutor_profiles_bio_filter on tutor_profiles;
create trigger tutor_profiles_bio_filter
  before insert or update of bio on tutor_profiles
  for each row execute function public.reject_blocked_content('bio');

drop trigger if exists reviews_comment_filter on reviews;
create trigger reviews_comment_filter
  before insert or update of comment on reviews
  for each row execute function public.reject_blocked_content('comment');

-- ---------- seed ----------
-- A deliberately small starter set: the unambiguous slurs and explicit threats, where a
-- word-boundary match is very unlikely to catch innocent text. Moderation of everything
-- else stays human (content_reports + the admin queue), which is what the reply to App
-- Review describes. Extend via the admin panel, not by editing this migration.
insert into blocked_terms (term, category) values
  ('nigger', 'slur'),
  ('nigga', 'slur'),
  ('faggot', 'slur'),
  ('fag', 'slur'),
  ('tranny', 'slur'),
  ('retard', 'slur'),
  ('retarded', 'slur'),
  ('kike', 'slur'),
  ('spic', 'slur'),
  ('chink', 'slur'),
  ('wetback', 'slur'),
  ('coon', 'slur'),
  ('kill yourself', 'harassment'),
  ('kys', 'harassment'),
  ('i will kill you', 'harassment'),
  ('rape you', 'harassment'),
  ('child porn', 'harassment'),
  ('cp for sale', 'harassment')
on conflict (term) do nothing;
