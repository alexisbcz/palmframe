-- Books run as a chain of function calls, and a chain can break: a function can
-- be killed, a kick can be lost, and a batch finishes on Anthropic's schedule.
-- This wakes whatever is due, once a minute. Same secret as the machines: with
-- no secret in Vault the job matches no row and calls nothing.
select cron.schedule(
  'books-tick',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://www.palmframe.com/api/books/tick',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
      timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets s
    where s.name = 'machines_cron_secret'
  $job$
);
