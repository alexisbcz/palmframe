-- Drafts are the record the line rules read: blocks for going auto, published and
-- retracted rows for the stance cooldown, and retraction notes for the public
-- page. Owners lost insert and update in 20261031190000. Delete went with neither,
-- so an owner could clear that record. No route deletes a draft through the user's
-- client, and removing a machine still cascades: that runs as the table's owner.
drop policy "Owners delete their drafts" on public.comic_machine_drafts;
revoke delete on public.comic_machine_drafts from authenticated;

-- The webhook a message went out through. Only that webhook can delete it, so one
-- saved since can't take it back. The id alone, which is no credential.
alter table public.comic_machine_drafts
  add column discord_webhook_id text check (char_length(discord_webhook_id) <= 32);

-- A machine that dropped its line sits out until what it wrote under it has gone.
alter table public.comic_machine_runs
  drop constraint comic_machine_runs_decision_check,
  add constraint comic_machine_runs_decision_check check (decision in (
    'running', 'filed', 'passed', 'refused', 'exhausted', 'invalid', 'failed', 'blocked',
    'empty', 'capped', 'ceiling', 'breaker', 'no_writer', 'no_credits', 'deadline', 'error',
    'frozen', 'no_calendar', 'not_public', 'no_desk', 'line_left'
  ));
