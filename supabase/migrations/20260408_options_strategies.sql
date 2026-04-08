-- ============================================================
-- Migration: options_strategies — dedicated options trading table
-- Separate from user_strategies (equity). Handles index/stock
-- options buying, selling, and multi-leg spread strategies.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.options_strategies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name                text NOT NULL,
  description         text,

  -- Underlying instrument
  underlying          text NOT NULL DEFAULT 'NIFTY',     -- NIFTY | BANKNIFTY | FINNIFTY | MIDCPNIFTY | custom
  exchange            text NOT NULL DEFAULT 'NFO',       -- NFO | BFO
  instrument_type     text NOT NULL DEFAULT 'OPTIDX',   -- OPTIDX | OPTSTK

  -- Expiry config
  expiry_type         text NOT NULL DEFAULT 'weekly',    -- weekly | monthly | next_weekly

  -- Strike configuration
  strike_selection    text NOT NULL DEFAULT 'ATM',       -- ATM | OTM1 | OTM2 | ITM1 | ITM2
  option_type         text NOT NULL DEFAULT 'auto',      -- CE | PE | auto (auto picks based on direction)
  trade_direction     text NOT NULL DEFAULT 'bullish',   -- bullish | bearish | neutral

  -- Strategy structure
  strategy_style      text NOT NULL DEFAULT 'buying',    -- buying | selling | spread | straddle | strangle | iron_condor
  legs                jsonb NOT NULL DEFAULT '[]',       -- [{action, strike_offset, option_type, qty_ratio}] for multi-leg

  -- Entry conditions (all optional, combined with AND logic)
  -- {
  --   orb_breakout: bool, vwap_cross: bool, momentum_bars: int,
  --   vix_filter: {enabled: bool, max_vix: number},
  --   expiry_day_guard: bool,
  --   custom_indicator: {type, params} — same grammar as user_strategies
  -- }
  entry_conditions    jsonb NOT NULL DEFAULT '{}',

  -- ORB configuration
  -- {orb_duration_mins, min_range_pct, max_range_pct, momentum_bars}
  orb_config          jsonb NOT NULL DEFAULT '{"orb_duration_mins":15,"min_range_pct":0.2,"max_range_pct":1.0,"momentum_bars":3}',

  -- Exit rules (premium-based, not underlying price)
  -- {sl_pct, tp_pct, trailing_enabled, trail_after_pct, trail_pct, time_exit_hhmm, max_reentry_count}
  exit_rules          jsonb NOT NULL DEFAULT '{"sl_pct":30,"tp_pct":50,"trailing_enabled":true,"trail_after_pct":30,"trail_pct":15,"time_exit_hhmm":"15:15","max_reentry_count":1}',

  -- Risk config
  -- {max_premium_per_lot, max_daily_loss_inr, lot_size}
  risk_config         jsonb NOT NULL DEFAULT '{"max_premium_per_lot":500,"max_daily_loss_inr":2000,"lot_size":1}',

  -- Trading window
  start_time          text NOT NULL DEFAULT '09:30',
  end_time            text NOT NULL DEFAULT '15:15',
  execution_days      text[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],

  -- State tracking (updated by edge functions)
  -- {last_run_date, reentry_count, orb_high, orb_low, trade_state}
  strategy_state      jsonb NOT NULL DEFAULT '{}',

  -- Paper only flag (force paper mode even if user has live integration)
  is_paper_only       boolean NOT NULL DEFAULT true,
  is_active           boolean NOT NULL DEFAULT true,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_options_strategies_user
  ON public.options_strategies(user_id);

CREATE INDEX IF NOT EXISTS idx_options_strategies_active
  ON public.options_strategies(user_id, is_active)
  WHERE is_active = true;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_options_strategies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_options_strategies_updated_at ON public.options_strategies;
CREATE TRIGGER trg_options_strategies_updated_at
  BEFORE UPDATE ON public.options_strategies
  FOR EACH ROW EXECUTE FUNCTION update_options_strategies_updated_at();

-- RLS
ALTER TABLE public.options_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own options strategies"
  ON public.options_strategies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access options strategies"
  ON public.options_strategies FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Super-admin full access options strategies"
  ON public.options_strategies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.options_strategies;

COMMENT ON TABLE public.options_strategies IS
  'Options trading strategies — index/stock options buying, selling, multi-leg spreads with ORB/momentum entry and premium-based SL/TP exit logic.';
