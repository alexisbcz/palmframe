-- Wakes content machines every 10 minutes from inside the database, because
-- GitHub's scheduler never fired and Vercel's free plan only runs daily crons.
-- The secret lives in Vault under this name, never in this file. Without it
-- the job matches no row and calls nothing, which keeps local databases quiet.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'machines-tick',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://www.palmframe.com/api/machines/tick',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
      timeout_milliseconds := 150000
    )
    from vault.decrypted_secrets s
    where s.name = 'machines_cron_secret'
  $job$
);
