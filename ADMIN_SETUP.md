# Admin Predictions Setup (Root Project)

Apply these migrations:

- `supabase/migrations/20260222_admin_predictions_and_presets.sql`
- `supabase/migrations/20260222_admin_predictions_cron.sql`

Deploy these Edge Functions:

- `admin-users`
- `admin-watchlist`
- `admin-daily-board`
- `public-daily-board`

Admin access requires both:

1. email = `trading@admin.com`
2. `user_roles.role = 'admin'`

After creating `trading@admin.com` in Supabase Auth, run:

```sql
insert into public.user_roles (user_id, role)
values ('<auth_user_uuid_here>', 'admin')
on conflict (user_id) do update set role = excluded.role;
```
