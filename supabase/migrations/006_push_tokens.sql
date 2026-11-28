-- =============================================================================
-- DocuDash | 006_push_tokens.sql
-- Stores Expo Push tokens registered by resident mobile devices so Vercel
-- `POST /api/notify-resident` can deliver remote push alerts alongside email
-- and local/in-app Realtime notifications.
-- Depends on 001_schema.sql.
-- =============================================================================

begin;

create table if not exists public.user_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique,
  platform        text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint user_push_tokens_format
    check (expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$'),
  constraint user_push_tokens_platform_check
    check (platform in ('android', 'ios'))
);

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id);

drop trigger if exists user_push_tokens_set_updated_at on public.user_push_tokens;
create trigger user_push_tokens_set_updated_at
  before update on public.user_push_tokens
  for each row execute function private.set_updated_at();

alter table public.user_push_tokens enable row level security;

revoke all on public.user_push_tokens from anon, authenticated;
grant select, insert, update, delete on public.user_push_tokens to authenticated;
grant all on public.user_push_tokens to service_role;

drop policy if exists user_push_tokens_select_own on public.user_push_tokens;
create policy user_push_tokens_select_own on public.user_push_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_push_tokens_insert_own on public.user_push_tokens;
create policy user_push_tokens_insert_own on public.user_push_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_push_tokens_update_own on public.user_push_tokens;
create policy user_push_tokens_update_own on public.user_push_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_push_tokens_delete_own on public.user_push_tokens;
create policy user_push_tokens_delete_own on public.user_push_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
