create or replace function public.contains_contact_info(p_text text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v text := lower(coalesce(p_text, ''));
begin
  if v ~ '(^|[^[:alnum:]_])[+]?[ (]*[0-9]([[:space:]().+-]*[0-9]){9,}[)]?($|[^[:alnum:]_])' then
    return 'phone';
  end if;
  v := regexp_replace(v, '[[:space:]]*[(\[][[:space:]]*at[[:space:]]*[)\]][[:space:]]*', ' at ', 'g');
  v := regexp_replace(v, '[[:space:]]*[(\[][[:space:]]*dot[[:space:]]*[)\]][[:space:]]*', ' dot ', 'g');
  if v ~ '[[:alnum:]_.%+-]+(@|[[:space:]]+at[[:space:]]+)[[:alnum:]-]+((\.|[[:space:]]+dot[[:space:]]+)[[:alnum:]-]+)*(\.|[[:space:]]+dot[[:space:]]+)[[:alpha:]]{2,}\M' then
    return 'email';
  end if;
  if v ~ '\m(venmo|cash[[:space:]]*app|zelle|paypal|apple[[:space:]]+(pay|cash))\M|\$[[:alpha:]][[:alnum:]_]*' then
    return 'payment';
  end if;
  if v ~ '\m(snapchat|insta|instagram|whatsapp|telegram|discord)\M|(^|[^[:alnum:]_])@[[:alnum:]_][[:alnum:]_.]*'
    or v ~ '\m(snap|ig)\M[[:space:]]*(is\M|:|@|me\M)'
    or v ~ '\m(on|my|your|via)[[:space:]]+(snap|ig)\M'
    or v ~ '\m(text|call)[[:space:]]+me[[:space:]]+(at[[:space:]]+)?[+ (]*[0-9]([[:space:]().+-]*[0-9]){6,}\M' then
    return 'social';
  end if;
  return null;
end;
$$;
revoke all on function public.contains_contact_info(text) from public, anon, authenticated;

-- Keep the report-before-message DDL lock order used by 0049.
lock table public.content_reports in share row exclusive mode;
lock table public.messages in share row exclusive mode;

create function public.guard_message_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.conversations%rowtype;
  hit text;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then return new; end if;
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then return new; end if;
  select * into c from public.conversations where id = new.conversation_id;
  if c.kind = 'admin' then return new; end if;
  hit := public.contains_contact_info(new.content);
  if hit is null then return new; end if;
  if not exists (
    select 1 from public.bookings b
    where b.student_id = c.student_id and b.tutor_id = c.tutor_id
      and (b.status in ('confirmed', 'completed', 'no_show') or b.accepted_at is not null
        or b.cancelled_from_status = 'confirmed')
  ) then
    raise exception 'For your safety, keep contact and payment info on Noot until your tutor accepts a booking. Payments made outside Noot aren''t protected.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_message_contact() from public, anon, authenticated;
create trigger messages_guard_contact before insert or update of content on public.messages
for each row execute function public.guard_message_contact();

create function public.flag_message_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hit text;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then return new; end if;
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then return new; end if;
  if exists (select 1 from public.conversations where id = new.conversation_id and kind = 'admin') then return new; end if;
  hit := public.contains_contact_info(new.content);
  if hit is null then return new; end if;
  begin
    insert into public.content_reports (reporter_id, auto_flagged, target_kind, target_message_id, reason, detail)
    values (null, true, 'message', new.id, 'inappropriate', 'Contact info (' || hit || ').')
    on conflict (target_message_id) where auto_flagged and status = 'open'
    do update set detail = case
      when content_reports.detail like '%Contact info (%' then content_reports.detail
      else concat_ws(' ', content_reports.detail, excluded.detail) end;
  exception when others then
    raise warning 'flag_message_contact: could not flag message %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.flag_message_contact() from public, anon, authenticated;
create trigger messages_flag_contact after insert or update of content on public.messages
for each row execute function public.flag_message_contact();
