import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StartTradeRequest {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  riskGrade: string;
  entryPrice: number;
  shares: number;
  investmentAmount: number;
  leverage?: number;
  marginType?: string;
  // Broker execution fields
  exchange?: string;        // NSE | BSE | NFO
  product?: string;         // CNC | MIS | NRML
  brokerOrderId?: string;   // Order ID returned by broker on entry
  strategyType?: string;    // trend_following | momentum | etc.
  stopLossPercentage: number;
  targetProfitPercentage: number;
  holdingPeriod?: string;
  aiRecommendedHoldPeriod?: string;
  expectedRoiBest?: number;
  expectedRoiLikely?: number;
  expectedRoiWorst?: number;
  predictionId?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');

    // Create service role client for both auth validation and DB operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Validate user JWT token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      console.error('Auth validation error:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ User authenticated:', user.id);

    const requestBody: StartTradeRequest = await req.json();
    
    // Validate required fields
    if (!requestBody.symbol || !requestBody.action || !requestBody.entryPrice || requestBody.shares == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow HOLD tracking (user can override AI recommendation)
    // No longer blocking HOLD - user has manual control

    // Calculate stop loss and take profit prices
    // BUY:  SL below entry, TP above entry
    // SELL: SL above entry, TP below entry
    const isSell = requestBody.action === "SELL";
    const stopLossPrice = isSell
      ? requestBody.entryPrice * (1 + requestBody.stopLossPercentage / 100)
      : requestBody.entryPrice * (1 - requestBody.stopLossPercentage / 100);
    const takeProfitPrice = isSell
      ? requestBody.entryPrice * (1 - requestBody.targetProfitPercentage / 100)
      : requestBody.entryPrice * (1 + requestBody.targetProfitPercentage / 100);

    // Calculate expected exit time based on holding period
    const now = new Date();
    let expectedExitTime = null;
    
    if (requestBody.holdingPeriod) {
      const period = requestBody.holdingPeriod.toLowerCase();
      
      // Handle various period formats
      if (period.includes('intraday') || period.includes('hours') || period.includes('same day')) {
        expectedExitTime = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours
      } else if (period.includes('1-2 day') || period.includes('2 day')) {
        expectedExitTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      } else if (period.includes('3-5 day') || period.includes('5 day')) {
        expectedExitTime = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      } else if (period.includes('1 week') || period.includes('week') || period.includes('7 day')) {
        expectedExitTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (period.includes('2-4 week') || period.includes('2 weeks') || period.includes('4 weeks')) {
        expectedExitTime = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 weeks avg
      } else if (period.includes('month') || period.includes('30 day')) {
        expectedExitTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else if (period.includes('none') || period === 'null') {
        expectedExitTime = null; // No holding period - track indefinitely
      } else {
        // Try to parse numeric days (e.g., "5-7 days" -> extract 7)
        const dayMatch = period.match(/(\d+)[-\s]?day/);
        if (dayMatch) {
          const days = parseInt(dayMatch[1]);
          expectedExitTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        }
      }
    }

    const isCrypto = /BTC|ETH|-USD|CRYPTO/i.test(requestBody.symbol || '');
    const isForex = /=[Xx]|[A-Z]{6}$/.test(requestBody.symbol || '') || requestBody.exchange === 'FOREX';
    const defaultExchange = isCrypto ? 'CRYPTO' : isForex ? 'FOREX' : (requestBody.exchange || 'NSE');
    const defaultProduct = isCrypto || isForex ? 'CNC' : (requestBody.product || 'CNC');
    const parsedShares = Number(requestBody.shares);
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      return new Response(
        JSON.stringify({ error: 'shares must be a valid number greater than 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Quantity normalization rule:
    // - Crypto supports fractional quantity (up to 8 decimals)
    // - Non-crypto is rounded to whole quantity automatically
    const normalizedShares = isCrypto
      ? Number(parsedShares.toFixed(8))
      : Math.max(1, Math.round(parsedShares));

    // Create active trade record
    const tradeData = {
      user_id: user.id,
      symbol: requestBody.symbol,
      action: requestBody.action,
      status: 'active',
      
      entry_price: requestBody.entryPrice,
      entry_time: now.toISOString(),
      shares: normalizedShares,
      investment_amount: requestBody.investmentAmount,
      
      leverage: requestBody.leverage || 1.0,
      margin_type: requestBody.marginType || 'cash',

      exchange:        requestBody.exchange      || defaultExchange,
      product:         requestBody.product       || defaultProduct,
      broker_order_id: requestBody.brokerOrderId || null,
      strategy_type:   requestBody.strategyType  || null,

      stop_loss_price: stopLossPrice,
      take_profit_price: takeProfitPrice,
      stop_loss_percentage: requestBody.stopLossPercentage,
      target_profit_percentage: requestBody.targetProfitPercentage,
      
      holding_period: requestBody.holdingPeriod,
      ai_recommended_hold_period: requestBody.aiRecommendedHoldPeriod,
      expected_exit_time: expectedExitTime?.toISOString(),
      
      current_price: requestBody.entryPrice,
      current_pnl: 0,
      current_pnl_percentage: 0,
      last_price_update: now.toISOString(),
      
      prediction_id: requestBody.predictionId,
      confidence: requestBody.confidence,
      risk_grade: requestBody.riskGrade,
      expected_roi_best: requestBody.expectedRoiBest,
      expected_roi_likely: requestBody.expectedRoiLikely,
      expected_roi_worst: requestBody.expectedRoiWorst
    };

    // Insert trade
    const { data: trade, error: insertError } = await supabaseClient
      .from('active_trades')
      .insert(tradeData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating trade:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create trade session', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create initial notification
    await supabaseClient
      .from('trade_notifications')
      .insert({
        trade_id: trade.id,
        user_id: user.id,
        type: 'mid_trade_update',
        title: `Trade Started: ${requestBody.action} ${requestBody.symbol}`,
        message: `Your ${requestBody.action} trade for ${requestBody.symbol} has started. Entry: ₹${requestBody.entryPrice.toFixed(2)}, Target: ₹${takeProfitPrice.toFixed(2)}, Stop: ₹${stopLossPrice.toFixed(2)}${requestBody.brokerOrderId ? ` | Order ID: ${requestBody.brokerOrderId}` : ''}`,
        status: 'pending',
        channel: 'in_app'
      });

    console.log(`✅ Trade session created: ${trade.id} for ${requestBody.symbol}`);

    return new Response(
      JSON.stringify({
        success: true,
        trade: {
          id: trade.id,
          symbol: trade.symbol,
          action: trade.action,
          status: trade.status,
          entryPrice: trade.entry_price,
          stopLoss: stopLossPrice,
          takeProfit: takeProfitPrice,
          expectedExitTime: expectedExitTime,
          holdingPeriod: requestBody.holdingPeriod || requestBody.aiRecommendedHoldPeriod
        },
        message: 'Trade session started successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in start-trade-session:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
