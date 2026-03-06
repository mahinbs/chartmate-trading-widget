import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch current price from Yahoo Finance
async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    // Normalize symbol for Yahoo Finance
    let yahooSymbol = symbol.toUpperCase();
    if (!yahooSymbol.includes('.') && !yahooSymbol.includes('^')) {
      yahooSymbol = yahooSymbol; // US stocks don't need suffix
    }

    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      console.log(`Yahoo Finance API error for ${yahooSymbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      console.log(`No data found for ${yahooSymbol}`);
      return null;
    }

    // Get the most recent price
    const meta = result.meta;
    const currentPrice = meta?.regularMarketPrice || meta?.previousClose;

    if (!currentPrice) {
      console.log(`No current price found for ${yahooSymbol}`);
      return null;
    }

    return currentPrice;
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    return null;
  }
}

// Calculate P&L
function calculatePnL(
  entryPrice: number,
  currentPrice: number,
  shares: number,
  leverage: number = 1.0
): { pnl: number; pnlPercentage: number } {
  const pnl = (currentPrice - entryPrice) * shares * leverage;
  const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
  
  return {
    pnl: Math.round(pnl * 100) / 100,
    pnlPercentage: Math.round(pnlPercentage * 10000) / 10000
  };
}

// Calculate trailing stop price
function calculateTrailingStop(
  entryPrice: number,
  currentPrice: number,
  highestPrice: number,
  stopLossPercentage: number,
  action: string
): number | null {
  // Only use trailing stop if trade is profitable
  const { pnlPercentage } = calculatePnL(entryPrice, currentPrice, 1, 1);
  
  if (pnlPercentage <= 0) {
    // Not profitable yet, use original stop loss
    return entryPrice * (1 - stopLossPercentage / 100);
  }

  // For BUY trades: trail from highest price reached
  if (action === 'BUY') {
    const trailingStop = highestPrice * (1 - stopLossPercentage / 100);
    return trailingStop;
  }

  // For SELL trades: trail from lowest price reached (inverse logic)
  // Not commonly used, but included for completeness
  return null;
}

// Check if exit conditions are met (with trailing stop support)
function checkExitConditions(
  trade: any, 
  currentPrice: number,
  highestPrice: number
): { 
  shouldExit: boolean; 
  reason: string | null; 
  newStopLoss: number | null 
} {
  let newStopLoss = trade.stop_loss_price;

  // Calculate trailing stop if trade is profitable
  if (trade.action === 'BUY' && trade.stop_loss_percentage) {
    const trailingStop = calculateTrailingStop(
      trade.entry_price,
      currentPrice,
      highestPrice,
      trade.stop_loss_percentage,
      trade.action
    );
    
    // Update stop loss if trailing stop is higher (locks in profits)
    if (trailingStop && trailingStop > trade.stop_loss_price) {
      newStopLoss = trailingStop;
      console.log(`🔄 Trailing stop updated for ${trade.symbol}: $${newStopLoss.toFixed(2)}`);
    }
  }

  // Stop loss hit (including trailing stop)
  if (newStopLoss && currentPrice <= newStopLoss) {
    return { 
      shouldExit: true, 
      reason: newStopLoss > trade.stop_loss_price ? 'trailing_stop_triggered' : 'stop_loss_triggered',
      newStopLoss 
    };
  }

  // Take profit hit
  if (trade.take_profit_price && currentPrice >= trade.take_profit_price) {
    return { shouldExit: true, reason: 'target_hit', newStopLoss };
  }

  // Holding period ended
  if (trade.expected_exit_time) {
    const now = new Date();
    const exitTime = new Date(trade.expected_exit_time);
    if (now >= exitTime) {
      return { shouldExit: true, reason: 'holding_period_ended', newStopLoss };
    }
  }

  return { shouldExit: false, reason: null, newStopLoss };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔄 Starting trade price update cycle...');

    // Create service role client (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all active trades
    const { data: activeTrades, error: fetchError } = await supabaseClient
      .from('active_trades')
      .select('*')
      .in('status', ['active', 'monitoring', 'exit_zone']);

    if (fetchError) {
      throw new Error(`Failed to fetch trades: ${fetchError.message}`);
    }

    if (!activeTrades || activeTrades.length === 0) {
      console.log('No active trades to update');
      return new Response(
        JSON.stringify({ message: 'No active trades', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${activeTrades.length} active trades`);

    let updated = 0;
    let completed = 0;
    let errors = 0;

    // Update each trade
    for (const trade of activeTrades) {
      try {
        // Fetch current price
        const currentPrice = await fetchCurrentPrice(trade.symbol);
        
        if (!currentPrice) {
          console.log(`Skipping ${trade.symbol} - no price available`);
          errors++;
          continue;
        }

        // Calculate P&L
        const { pnl, pnlPercentage } = calculatePnL(
          trade.entry_price,
          currentPrice,
          trade.shares,
          trade.leverage || 1.0
        );

        // Track highest price for trailing stop (fetch from history or current)
        const { data: priceHistory } = await supabaseClient
          .from('trade_updates')
          .select('price')
          .eq('trade_id', trade.id)
          .order('price', { ascending: false })
          .limit(1)
          .single();
        
        const highestPrice = Math.max(
          trade.entry_price,
          currentPrice,
          priceHistory?.price || 0
        );

        // Check exit conditions (with trailing stop support)
        const { shouldExit, reason, newStopLoss } = checkExitConditions(
          trade, 
          currentPrice,
          highestPrice
        );

        // Determine status
        let newStatus = trade.status;
        if (shouldExit) {
          newStatus = reason === 'stop_loss_triggered' ? 'stopped_out' :
                      reason === 'target_hit' ? 'target_hit' : 'completed';
        } else {
          // Check if approaching exit
          const now = new Date();
          if (trade.expected_exit_time) {
            const exitTime = new Date(trade.expected_exit_time);
            const timeRemaining = exitTime.getTime() - now.getTime();
            const totalDuration = exitTime.getTime() - new Date(trade.entry_time).getTime();
            
            // If 90% of time elapsed, mark as exit_zone
            if (timeRemaining < totalDuration * 0.1) {
              newStatus = 'exit_zone';
            } else if (timeRemaining < totalDuration * 0.5) {
              newStatus = 'monitoring';
            }
          }
        }

        // Update trade
        const updateData: any = {
          current_price: currentPrice,
          current_pnl: pnl,
          current_pnl_percentage: pnlPercentage,
          last_price_update: new Date().toISOString(),
          status: newStatus
        };

        // Update trailing stop if it changed
        if (newStopLoss && newStopLoss !== trade.stop_loss_price) {
          updateData.stop_loss_price = newStopLoss;
          console.log(`✅ Trailing stop updated for ${trade.symbol}: $${newStopLoss.toFixed(2)} (was $${trade.stop_loss_price.toFixed(2)})`);
        }

        // If completing, add exit details AND auto square-off via broker
        if (shouldExit) {
          updateData.exit_price = currentPrice;
          updateData.exit_time = new Date().toISOString();
          updateData.actual_pnl = pnl;
          updateData.actual_pnl_percentage = pnlPercentage;
          updateData.exit_reason = reason;

          // Auto square-off via broker if this trade was placed via the trading engine
          if (trade.broker_order_id) {
            try {
              const OPENALGO_URL = (Deno.env.get('OPENALGO_URL') ?? '').replace(/\/$/, '');
              // Load the user's OpenAlgo API key
              const { data: integration } = await supabaseClient
                .from('user_trading_integration')
                .select('openalgo_api_key')
                .eq('user_id', trade.user_id)
                .eq('is_active', true)
                .maybeSingle();

              const openalgoApiKey = integration?.openalgo_api_key ?? '';

              if (OPENALGO_URL && openalgoApiKey) {
                const exitAction = trade.action === 'BUY' ? 'SELL' : 'BUY';
                const exitRes = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    apikey:             openalgoApiKey,
                    strategy:           `ChartMate Auto-Exit`,
                    exchange:           trade.exchange   || 'NSE',
                    symbol:             trade.symbol,
                    action:             exitAction,
                    product:            trade.product    || 'CNC',
                    pricetype:          'MARKET',
                    quantity:           String(trade.shares),
                    price:              '0',
                    trigger_price:      '0',
                    disclosed_quantity: '0',
                  }),
                });
                const exitData = await exitRes.json().catch(() => ({}));
                const exitOrderId = (exitData as any)?.orderid ?? (exitData as any)?.order_id;
                if (exitOrderId) {
                  updateData.exit_order_id = exitOrderId;
                  console.log(`✅ Auto-exit order placed for ${trade.symbol}: ${exitOrderId} (${reason})`);
                } else {
                  console.error(`❌ Auto-exit order failed for ${trade.symbol}:`, exitData);
                }
              }
            } catch (exitErr) {
              console.error(`❌ Auto-exit broker call failed for ${trade.symbol}:`, exitErr);
            }
          }
        }

        const { error: updateError } = await supabaseClient
          .from('active_trades')
          .update(updateData)
          .eq('id', trade.id);

        if (updateError) {
          console.error(`Error updating trade ${trade.id}:`, updateError);
          errors++;
          continue;
        }

        // Insert price update history
        await supabaseClient
          .from('trade_updates')
          .insert({
            trade_id: trade.id,
            price: currentPrice,
            pnl: pnl,
            pnl_percentage: pnlPercentage,
            status: newStatus
          });

        // Send notifications if needed
        if (shouldExit) {
          // Create completion notification
          await supabaseClient
            .from('trade_notifications')
            .insert({
              trade_id: trade.id,
              user_id: trade.user_id,
              type: reason === 'stop_loss_triggered' ? 'stop_loss_triggered' :
                    reason === 'target_hit' ? 'target_hit' : 'holding_period_ending',
              title: `Trade ${reason === 'target_hit' ? '🎯 Target Hit' : reason === 'stop_loss_triggered' || reason === 'trailing_stop_triggered' ? '🛑 Stop Loss Hit' : '✅ Completed'}: ${trade.symbol}`,
              message: `Your ${trade.action} trade for ${trade.symbol} has ${reason === 'target_hit' ? 'hit target' : reason?.includes('stop') ? 'hit stop loss' : 'completed'}. P&L: ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)} (${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(2)}%)${trade.broker_order_id ? ' | Exit order placed on broker automatically.' : ''}`,
              status: 'pending',
              channel: 'in_app'
            });
          
          completed++;
        } else if (newStatus === 'exit_zone' && !trade.exit_zone_alert_sent) {
          // Create exit zone notification
          await supabaseClient
            .from('trade_notifications')
            .insert({
              trade_id: trade.id,
              user_id: trade.user_id,
              type: 'exit_zone_alert',
              title: `Exit Zone: ${trade.symbol}`,
              message: `Your ${trade.symbol} trade is approaching exit time. Current P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
              status: 'pending',
              channel: 'in_app'
            });

          // Mark alert as sent
          await supabaseClient
            .from('active_trades')
            .update({ exit_zone_alert_sent: true })
            .eq('id', trade.id);
        }

        updated++;
        console.log(`✅ Updated ${trade.symbol}: $${currentPrice.toFixed(2)}, P&L: ${pnl.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);

      } catch (tradeError) {
        console.error(`Error processing trade ${trade.id}:`, tradeError);
        errors++;
      }
    }

    console.log(`✅ Update cycle complete: ${updated} updated, ${completed} completed, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        totalTrades: activeTrades.length,
        updated,
        completed,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in update-trade-prices:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
