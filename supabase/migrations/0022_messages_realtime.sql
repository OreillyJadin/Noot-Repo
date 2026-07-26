-- 0022_messages_realtime.sql — actually publish `messages` to Realtime.
--
-- api.chat.subscribe() has always opened a postgres_changes channel on public.messages, but
-- nothing was ever added to the supabase_realtime publication, so the channel subscribed
-- successfully and then never fired. Live chat has been silently inert: a message only
-- appeared for the other person when they reopened the thread. Found while testing whether
-- attachments arrive over the live path (0021).
--
-- RLS still applies to Realtime — a subscriber is only sent rows its policies allow, so this
-- publishes the table without widening who can read a message.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
