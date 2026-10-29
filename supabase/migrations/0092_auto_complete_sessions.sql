create or replace function public.request_auto_complete_sessions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select
    max(case when name = 'noot_project_url' then decrypted_secret end),
    max(case when name = 'noot_service_role_key' then decrypted_secret end)
  into v_url, v_key
  from vault.decrypted_secrets
  where name in ('noot_project_url', 'noot_service_role_key');

  if nullif(v_url, '') is not null and nullif(v_key, '') is not null then
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/auto-complete-sessions',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  end if;
exception when others then
  raise warning 'Could not request auto-completion of sessions: %', sqlerrm;
end
$$;
revoke all on function public.request_auto_complete_sessions() from public, anon, authenticated;
grant execute on function public.request_auto_complete_sessions() to service_role;

select cron.schedule('auto-complete-sessions', '*/15 * * * *', $$select public.request_auto_complete_sessions()$$);
