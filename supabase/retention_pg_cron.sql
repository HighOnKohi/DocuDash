-- =============================================================================
-- DocuDash | supabase/retention_pg_cron.sql (Optional Supabase-native scheduler)
--
-- Schedules the daily RA 10173 30-day attachment retention purge directly
-- inside Supabase using pg_cron + pg_net + Supabase Vault — NO Vercel Cron and
-- NO GitHub Actions inactivity timeout.
--
-- Prerequisites (run once in Supabase Dashboard -> Integrations / Extensions):
--   1. Enable "pg_cron" and "pg_net" extensions.
--   2. Store your shared CRON_SECRET (same value set in Vercel Env Vars,
--      >= 16 chars) in Supabase Vault (replace <YOUR_CRON_SECRET> below).
--   3. Run this script once in the Supabase SQL Editor.
-- =============================================================================

-- 1. Enable extensions (safe if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2. Save (or rotate) the purge secret and endpoint URL in Supabase Vault.
--    Replace <YOUR_CRON_SECRET> before running!
do $$
declare
  v_secret_id uuid;
  v_url_id    uuid;
begin
  select id into v_secret_id from vault.secrets where name = 'docudash_cron_secret';
  if v_secret_id is null then
    perform vault.create_secret('<YOUR_CRON_SECRET>', 'docudash_cron_secret', 'Shared bearer token for POST /api/purge-attachments');
  else
    perform vault.update_secret(v_secret_id, '<YOUR_CRON_SECRET>');
  end if;

  select id into v_url_id from vault.secrets where name = 'docudash_purge_url';
  if v_url_id is null then
    perform vault.create_secret('https://docu-dash-ph.vercel.app/api/purge-attachments', 'docudash_purge_url', 'DocuDash retention purge endpoint');
  else
    perform vault.update_secret(v_url_id, 'https://docu-dash-ph.vercel.app/api/purge-attachments');
  end if;
end
$$;

-- 3. Remove any previous schedule with the same name so re-running is idempotent.
select cron.unschedule(jobid)
from cron.job
where jobname = 'docudash-ra10173-attachment-purge';

-- 4. Schedule daily at 03:00 AM Asia/Manila (19:00 UTC).
select cron.schedule(
  'docudash-ra10173-attachment-purge',
  '0 19 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'docudash_purge_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'docudash_cron_secret' limit 1)
    ),
    body := '{"retentionDays":30,"dryRun":false}'::jsonb
  );
  $$
);

-- Verify the job is registered:
select jobid, jobname, schedule, active from cron.job where jobname = 'docudash-ra10173-attachment-purge';
