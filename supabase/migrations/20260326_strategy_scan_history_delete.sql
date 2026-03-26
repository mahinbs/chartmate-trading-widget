-- Allow users to delete their own scanner history rows (e.g. from client with user JWT).
-- Edge function uses service role and is unaffected; this keeps RLS consistent.

drop policy if exists "Users can delete their strategy scan history" on public.strategy_scan_history;
create policy "Users can delete their strategy scan history"
on public.strategy_scan_history
for delete
using (auth.uid() = user_id);
