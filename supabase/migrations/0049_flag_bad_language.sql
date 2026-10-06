-- Ordinary bad language: blocked where it is published, flagged where it is private (ERR-026).
--
-- 0029 blocks a short zero-tolerance list (slurs, threats) everywhere a user can type.
-- This adds a second list, category 'profanity' — common swearing — and treats it by where
-- the text ends up:
--   • bios, review comments, names, majors, booking locations: BLOCKED, like the 0029 list.
--     These are shown to people who never chose to talk to the author.
--   • chat messages: SENT, and flagged into content_reports for the admin queue. A filter
--     that refuses chat messages misfires on ordinary conversation, and nobody on the team
--     reads chats by hand — the flag is what brings a message to an admin.
-- The zero-tolerance list is unchanged: still blocked in chat too, which is what the reply
-- to App Review says ("Messages are filtered server-side for objectionable language").

-- ---------- the two lists, still one table ----------
-- No check constraint on category: admins can already add rows, and a category this
-- migration has never heard of must not fail the deploy. Anything that is not 'profanity'
-- is treated as zero-tolerance, which is the safe reading.
comment on table blocked_terms is
  'Single source of truth for the content filter. Matched case-insensitively on word boundaries. Categories slur and harassment are blocked everywhere; profanity is blocked in published text and only flagged in chat (0049). Admin-managed; never client-writable.';

-- contains_blocked_term() keeps its meaning — the first term of ANY category — so every
-- 0029/0032 trigger now blocks profanity too without being redefined. The two helpers below
-- split the list for the one table that treats the categories differently.
create or replace function public.contains_zero_tolerance_term(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select t.term
  from blocked_terms t
  where p_text is not null
    and t.category <> 'profanity'
    and p_text ~* ('\m' || regexp_replace(t.term, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M')
  limit 1;
$$;

create or replace function public.contains_profanity(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select t.term
  from blocked_terms t
  where p_text is not null
    and t.category = 'profanity'
    and p_text ~* ('\m' || regexp_replace(t.term, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M')
  limit 1;
$$;

-- All three return a term from the list, which users must not be able to read (0029). Until
-- now contains_blocked_term() was callable by anyone, signed in or not: a word-by-word
-- oracle for the list. It cannot simply be revoked — reject_blocked_content() ran as the
-- writing user and called it — so that trigger function becomes SECURITY DEFINER first
-- (same body as 0029). Trigger functions fire regardless of the caller's EXECUTE grant.
create or replace function public.reject_blocked_content()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text := tg_argv[0];
  hit text;
  val text;
begin
  val := to_jsonb(new) ->> col;

  if tg_op = 'UPDATE' and val is not distinct from (to_jsonb(old) ->> col) then
    return new;
  end if;

  hit := public.contains_blocked_term(val);
  if hit is not null then
    raise exception 'That wording breaks our community rules. Please revise it and try again.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.contains_blocked_term(text) from public, anon, authenticated;
revoke all on function public.contains_zero_tolerance_term(text) from public, anon, authenticated;
revoke all on function public.contains_profanity(text) from public, anon, authenticated;
revoke all on function public.reject_blocked_content() from public, anon, authenticated;

-- ---------- a flag is a report nobody filed ----------
-- reporter_id was NOT NULL because every row used to come from a person; the insert policy
-- (reporter_id = auth.uid()) still stops a user from writing a reporter-less row themselves.
-- Done before the messages triggers are touched, so this migration takes its locks in the
-- same order a user filing a report does (content_reports, then messages).
alter table content_reports alter column reporter_id drop not null;
alter table content_reports add column if not exists auto_flagged boolean not null default false;
alter table content_reports drop constraint if exists content_reports_reporter_or_auto;
alter table content_reports add constraint content_reports_reporter_or_auto
  check (auto_flagged = (reporter_id is null));

comment on column content_reports.auto_flagged is
  'True when the content filter raised this, not a person (0049). Such rows have no reporter.';

-- One open flag per message, so an edited message is not queued twice.
create unique index if not exists content_reports_one_open_auto_flag
  on content_reports (target_message_id)
  where auto_flagged and status = 'open';

-- ---------- chat: block the zero-tolerance list only ----------
create or replace function public.reject_zero_tolerance_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;
  if public.contains_zero_tolerance_term(new.content) is not null then
    raise exception 'That wording breaks our community rules. Please revise it and try again.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_content_filter on messages;
create trigger messages_content_filter
  before insert or update of content on messages
  for each row execute function public.reject_zero_tolerance_message();

-- ---------- chat: flag the rest ----------
create or replace function public.flag_profane_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_admin_room boolean;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;
  if public.contains_profanity(new.content) is null then
    return new;
  end if;
  -- The admin team room (0024) is the moderators talking to each other.
  select c.kind = 'admin' into is_admin_room from conversations c where c.id = new.conversation_id;
  if coalesce(is_admin_room, false) then
    return new;
  end if;
  -- One open flag per sender per conversation. Each flag is a card an admin has to clear;
  -- without this, two people who swear casually fill the queue, and anyone could bury a
  -- real report under a thousand of their own messages. The admin opens the flag and has
  -- the sender; a new flag is raised once that one is closed.
  if exists (
    select 1
    from content_reports r
    join messages m on m.id = r.target_message_id
    where r.auto_flagged and r.status = 'open'
      and m.conversation_id = new.conversation_id
      and m.sender_id = new.sender_id
  ) then
    return new;
  end if;
  -- Flagging must never be the reason a message fails to send.
  begin
    -- The matched word is deliberately not stored: the admin sees the message itself.
    insert into content_reports (reporter_id, auto_flagged, target_kind, target_message_id, reason, detail)
    values (null, true, 'message', new.id, 'inappropriate', 'Flagged automatically for language.')
    on conflict do nothing;
  exception when others then
    raise warning 'flag_profane_message: could not flag message %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.flag_profane_message() from public, anon, authenticated;
revoke all on function public.reject_zero_tolerance_message() from public, anon, authenticated;

drop trigger if exists messages_flag_profanity on messages;
create trigger messages_flag_profanity
  after insert or update of content on messages
  for each row execute function public.flag_profane_message();

-- ---------- seed ----------
-- Unambiguous swearing only. Left out on purpose: words that are also names or ordinary
-- words on a word boundary (dick, cock, ass, hell, damn, crap), because this list BLOCKS in
-- names and bios. Word-boundary matching means each inflection is its own row. There is no
-- screen for this list yet: an admin extends it in Studio, not by editing this migration.
insert into blocked_terms (term, category) values
  ('fuck', 'profanity'),
  ('fucks', 'profanity'),
  ('fucked', 'profanity'),
  ('fucking', 'profanity'),
  ('fuckin', 'profanity'),
  ('fucker', 'profanity'),
  ('fuckers', 'profanity'),
  ('motherfucker', 'profanity'),
  ('motherfuckers', 'profanity'),
  ('motherfucking', 'profanity'),
  ('shit', 'profanity'),
  ('shits', 'profanity'),
  ('shitty', 'profanity'),
  ('shithead', 'profanity'),
  ('bullshit', 'profanity'),
  ('bitch', 'profanity'),
  ('bitches', 'profanity'),
  ('bitchy', 'profanity'),
  ('asshole', 'profanity'),
  ('assholes', 'profanity'),
  ('dickhead', 'profanity'),
  ('dickheads', 'profanity'),
  ('cunt', 'profanity'),
  ('cunts', 'profanity'),
  ('pussy', 'profanity'),
  ('pussies', 'profanity'),
  ('slut', 'profanity'),
  ('sluts', 'profanity'),
  ('whore', 'profanity'),
  ('whores', 'profanity')
on conflict (term) do nothing;
