-- A video takes minutes and a browser tab can close, so this wakes every
-- episode with work left, once a minute. Same secret as the machines: with no
-- secret in Vault the job matches no row and calls nothing.
select cron.schedule(
  'anime-tick',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://www.palmframe.com/api/anime/tick',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
      timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets s
    where s.name = 'machines_cron_secret'
  $job$
);
