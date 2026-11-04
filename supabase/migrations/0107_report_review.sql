create index content_reports_reporter_created_idx
  on public.content_reports (reporter_id, created_at);

create function public.guard_review_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'authenticated'
      or (new.target_kind <> 'review' and new.target_review_id is null) then
    return new;
  end if;
  if not public.is_active_user() or new.reporter_id is distinct from auth.uid() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if new.target_kind <> 'review' or new.target_review_id is null or new.target_message_id is not null
      or new.target_user_id is not null or new.auto_flagged
      or new.status <> 'open' or new.reviewed_by is not null or new.reviewed_at is not null then
    raise exception 'Invalid review report' using errcode = '22023';
  end if;
  if not exists (select 1 from public.reviews r where r.id = new.target_review_id
      and r.approval_status = 'approved' and r.reviewer_id <> auth.uid()) then
    raise exception 'Review is not reportable' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.reporter_id::text, 0));
  if exists (select 1 from public.content_reports r where r.reporter_id = new.reporter_id
      and r.target_review_id = new.target_review_id and r.target_kind = 'review') then
    raise exception 'You have already reported this review' using errcode = '23505';
  end if;
  if (select count(*) from public.content_reports r where r.reporter_id = new.reporter_id
      and r.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many reports. Please try again later.' using errcode = '42900';
  end if;
  if length(coalesce(new.detail, '')) > 2000 then
    raise exception 'Report detail is too long' using errcode = '22023';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.guard_review_report() from public, anon, authenticated;
create trigger content_reports_guard_review before insert on public.content_reports
  for each row execute function public.guard_review_report();
