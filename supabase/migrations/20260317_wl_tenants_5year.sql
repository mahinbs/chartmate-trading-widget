-- Allow 5_year subscription plan in white_label_tenants
alter table public.white_label_tenants
  drop constraint if exists white_label_tenants_subscription_plan_check;

alter table public.white_label_tenants
  add constraint white_label_tenants_subscription_plan_check
    check (subscription_plan in ('1_year', '2_year', '5_year'));
