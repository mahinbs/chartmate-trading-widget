# entry-point-daily-digest

## How notifications actually work

1. **This Edge Function** runs on a **schedule** (you choose how often). It checks each user’s alarm time in their timezone and, when due, runs the analysis and **`INSERT`s a row** into `public.entry_point_alerts`.

2. **Supabase Realtime** is already wired in the app (`EntryDigestToastBridge.tsx`): the client **subscribes** to `INSERT` on `entry_point_alerts` for the logged-in user. When the row appears, the **toast / browser notification shows immediately** — there is no extra polling delay for delivery.

3. **What causes “late” notifications?** Only the **gap between cron runs**. If you only invoke this function every **5 minutes**, the digest might not run until up to ~5 minutes after your chosen minute (e.g. 10:41). That is **not** a Realtime limitation.

## Recommended schedule

- Prefer **`*/1 * * * *` (every 1 minute)** or your host’s equivalent so the digest runs close to the user’s wall time.
- Keep `ENTRY_DIGEST_SECRET` in Edge Function secrets and call with `Authorization: Bearer <secret>`.

Example (adjust project URL and secret; enable `pg_cron` + `pg_net` if your project supports it):

```sql
-- Example only — verify Supabase docs for your plan
select cron.schedule(
  'entry-point-daily-digest',
  '* * * * *',  -- every minute
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/entry-point-daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.entry_digest_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Or use **GitHub Actions**, **cron-job.org**, or **Supabase Dashboard → Edge Functions → Schedule** with a 1-minute cadence if available.

## This repo now includes DB-side scheduler migration

- Migration: `supabase/migrations/20260323_entry_digest_cron_schedule.sql`
- It creates:
  - `public.trigger_entry_point_daily_digest()` (DB function that HTTP-calls the Edge Function)
  - cron job `entry-point-daily-digest-every-minute` (`* * * * *`)

Set these DB settings once (SQL editor) so the function can call your project:

```sql
alter database postgres set app.supabase_url = 'https://<project-ref>.supabase.co';
alter database postgres set app.entry_digest_secret = '<ENTRY_DIGEST_SECRET>';
```

Then re-run migrations (or run the migration SQL) and verify `cron.job` has `entry-point-daily-digest-every-minute`.

## Summary

| Piece | Role |
|--------|------|
| Cron / scheduler | **When** the digest runs (set to **1 min** for best UX). |
| Edge Function | Computes signals and **inserts** `entry_point_alerts`. |
| **Supabase Realtime** | **Instant** toast to open clients when that row is inserted. |
