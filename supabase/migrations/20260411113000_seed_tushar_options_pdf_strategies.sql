-- Seed PDF option-selling strategies for tusharjain295@gmail.com.
-- Idempotent: safe to re-run.

do $$
declare
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = lower('tusharjain295@gmail.com')
  limit 1;

  if v_user_id is null then
    raise notice 'Options seed skipped: user tusharjain295@gmail.com not found in auth.users';
    return;
  end if;

  -- Remove previous auto-seeded versions of the same strategy names for this user.
  delete from public.options_strategies
  where user_id = v_user_id
    and name in (
      'PDF IC - Weekly Nifty Iron Condor',
      'PDF Strangle - High IV Crush',
      'PDF Bull Put Spread - Support Bounce',
      'PDF Jade Lizard - Zero Upside Risk'
    );

  insert into public.options_strategies (
    user_id, name, description,
    underlying, exchange, instrument_type, expiry_type,
    strike_selection, option_type, trade_direction, strategy_style, legs,
    entry_conditions, orb_config, exit_rules, risk_config,
    start_time, end_time, execution_days, strategy_state,
    is_paper_only, is_active
  )
  values
  (
    v_user_id,
    'PDF IC - Weekly Nifty Iron Condor',
    'AI Option Selling AlgoTrader v3.0: Monday 10:00-11:00, VIX>=13, 16-delta short strikes with 200-point wings.',
    'NIFTY', 'NFO', 'OPTIDX', 'weekly',
    'ATM', 'auto', 'neutral', 'iron_condor',
    '[]'::jsonb,
    jsonb_build_object(
      'strategy_type', 'iron_condor',
      'orb_breakout', false,
      'min_vix', 13.0,
      'delta_target', 0.16,
      'wing_width_pts', 200,
      'min_net_premium', 35.0,
      'max_lots', 4,
      'risk_pct', 0.02,
      'iv_rank_min', 25,
      'adx_max', 30
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'profit_target_pct', 45,
      'stop_loss_mult', 2.0,
      'time_exit_hhmm', '14:00',
      'max_reentry_count', 0
    ),
    jsonb_build_object(
      'lot_size', 1,
      'capital', 500000,
      'max_premium_per_lot', 500,
      'max_daily_loss_inr', 5000
    ),
    '10:00', '11:00', array['Mon'], '{}'::jsonb,
    true, false
  ),
  (
    v_user_id,
    'PDF Strangle - High IV Crush',
    'High IV crush setup: VIX>=18, 20-delta CE+PE short strangle, 50% target, 3x leg stop, max 2 rolls.',
    'NIFTY', 'NFO', 'OPTIDX', 'weekly',
    'ATM', 'auto', 'neutral', 'strangle',
    '[]'::jsonb,
    jsonb_build_object(
      'strategy_type', 'strangle',
      'orb_breakout', false,
      'min_vix', 18.0,
      'delta_target', 0.20,
      'min_net_premium', 35.0,
      'roll_trigger_pts', 30,
      'max_adjustments', 2,
      'risk_pct', 0.02
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'profit_target_pct', 50,
      'stop_loss_mult', 2.0,
      'time_exit_hhmm', '15:15',
      'max_reentry_count', 0
    ),
    jsonb_build_object(
      'lot_size', 1,
      'capital', 500000,
      'max_premium_per_lot', 700,
      'max_daily_loss_inr', 7000
    ),
    '09:30', '15:00', array['Mon','Tue','Wed','Thu'], '{}'::jsonb,
    true, false
  ),
  (
    v_user_id,
    'PDF Bull Put Spread - Support Bounce',
    'Bounce setup after >=1.2% drop and RSI<38: short put near -0.40 delta with 100-point hedge.',
    'NIFTY', 'NFO', 'OPTIDX', 'next_weekly',
    'ATM', 'PE', 'bullish', 'spread',
    '[]'::jsonb,
    jsonb_build_object(
      'strategy_type', 'bull_put_spread',
      'orb_breakout', false,
      'min_drop_pct', 1.2,
      'max_rsi', 38,
      'wing_width_pts', 100,
      'min_credit_pct_of_width', 0.40,
      'risk_pct', 0.02
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'profit_target_pct', 75,
      'stop_loss_mult', 2.0,
      'time_exit_hhmm', '15:15',
      'max_reentry_count', 0
    ),
    jsonb_build_object(
      'lot_size', 1,
      'capital', 500000,
      'max_premium_per_lot', 800,
      'max_daily_loss_inr', 8000
    ),
    '09:30', '15:00', array['Mon','Tue','Wed','Thu','Fri'], '{}'::jsonb,
    true, false
  ),
  (
    v_user_id,
    'PDF Jade Lizard - Zero Upside Risk',
    'Slight bullish, VIX>15: short -0.25 put + short 0.20 call spread (150 points), credit >= spread width.',
    'NIFTY', 'NFO', 'OPTIDX', 'weekly',
    'ATM', 'auto', 'bullish', 'spread',
    '[]'::jsonb,
    jsonb_build_object(
      'strategy_type', 'jade_lizard',
      'orb_breakout', false,
      'min_vix', 15.0,
      'short_put_delta', 0.25,
      'short_call_delta', 0.20,
      'call_spread_width_pts', 150,
      'risk_pct', 0.02
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'profit_target_pct', 50,
      'stop_loss_mult', 2.0,
      'time_exit_hhmm', '14:00',
      'max_reentry_count', 0
    ),
    jsonb_build_object(
      'lot_size', 1,
      'capital', 500000,
      'max_premium_per_lot', 900,
      'max_daily_loss_inr', 9000
    ),
    '09:30', '15:00', array['Mon','Tue','Wed','Thu'], '{}'::jsonb,
    true, false
  );
end
$$;
