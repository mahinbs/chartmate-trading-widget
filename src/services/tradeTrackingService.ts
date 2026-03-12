import { supabase } from "@/integrations/supabase/client";

export interface ActiveTrade {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  status: string;
  
  entryPrice: number;
  entryTime: string;
  shares: number;
  investmentAmount: number;
  
  leverage?: number;
  marginType?: string;
  
  /** NSE | BSE | NFO — needed to square off via OpenAlgo */
  exchange?: string;
  /** CNC | MIS | NRML — product type used for entry, same used for exit */
  product?: string;
  /** OpenAlgo order ID from entry */
  brokerOrderId?: string;
  /** OpenAlgo order ID from exit/square-off */
  exitOrderId?: string;
  /** Strategy type: trend_following | intraday | swing | fno */
  strategyType?: string;

  stopLossPrice?: number;
  takeProfitPrice?: number;
  stopLossPercentage?: number;
  targetProfitPercentage?: number;
  
  holdingPeriod?: string;
  aiRecommendedHoldPeriod?: string;
  expectedExitTime?: string;
  
  currentPrice?: number;
  currentPnl?: number;
  currentPnlPercentage?: number;
  lastPriceUpdate?: string;
  
  confidence?: number;
  riskGrade?: string;
  
  exitPrice?: number;
  exitTime?: string;
  actualPnl?: number;
  actualPnlPercentage?: number;
  exitReason?: string;
}

export interface TradeNotification {
  id: string;
  tradeId: string;
  type: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  readAt?: string;
}

class TradeTrackingService {
  
  /**
   * Start a new trade tracking session
   */
  async startTradeSession(params: {
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    riskGrade: string;
    entryPrice: number;
    shares: number;
    investmentAmount: number;
    leverage?: number;
    marginType?: string;
    exchange?: string;
    product?: string;
    brokerOrderId?: string;
    strategyType?: string;
    stopLossPercentage: number;
    targetProfitPercentage: number;
    holdingPeriod?: string;
    aiRecommendedHoldPeriod?: string;
    expectedRoiBest?: number;
    expectedRoiLikely?: number;
    expectedRoiWorst?: number;
    predictionId?: string;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke('start-trade-session', {
        body: params
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error: any) {
      console.error('Error starting trade session:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Get all active trades for current user
   */
  async getActiveTrades() {
    try {
      const { data, error } = await supabase
        .from('active_trades')
        .select('*')
        .in('status', ['active', 'monitoring', 'exit_zone'])
        .order('entry_time', { ascending: false });

      if (error) throw error;

      const trades: ActiveTrade[] = (data || []).map(this.mapDbToTrade);
      
      // Log current prices for debugging
      trades.forEach(t => {
        console.log(`💰 ${t.symbol}: Current=$${t.currentPrice?.toFixed(2) || 'N/A'}, P&L=$${t.currentPnl?.toFixed(2) || '0.00'} (${t.currentPnlPercentage?.toFixed(2) || '0.00'}%)`);
      });
      
      return { data: trades, error: null };
    } catch (error: any) {
      console.error('Error fetching active trades:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Get completed trades
   */
  async getCompletedTrades(limit: number = 50) {
    try {
      const { data, error } = await supabase
        .from('active_trades')
        .select('*')
        .in('status', ['completed', 'stopped_out', 'target_hit', 'cancelled'])
        .order('exit_time', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const trades: ActiveTrade[] = (data || []).map(this.mapDbToTrade);
      return { data: trades, error: null };
    } catch (error: any) {
      console.error('Error fetching completed trades:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Get last used strategy (most recent trade by entry_time) for "use previous strategy" prompt
   */
  async getLastUsedStrategy(): Promise<{ strategyType: string; product: string } | null> {
    try {
      const { data, error } = await supabase
        .from('active_trades')
        .select('strategy_type, product, entry_time')
        .order('entry_time', { ascending: false })
        .limit(1);

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.strategy_type) return null;
      return {
        strategyType: row.strategy_type as string,
        product: (row.product as string) || 'CNC',
      };
    } catch {
      return null;
    }
  }

  /**
   * Get a single trade by ID
   */
  async getTrade(tradeId: string) {
    try {
      const { data, error } = await supabase
        .from('active_trades')
        .select('*')
        .eq('id', tradeId)
        .single();

      if (error) throw error;

      const trade: ActiveTrade = this.mapDbToTrade(data);
      return { data: trade, error: null };
    } catch (error: any) {
      console.error('Error fetching trade:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Add more capital to an existing active trade. Recalculates avg entry, shares, SL/TP.
   */
  async addToPosition(params: {
    tradeId: string;
    additionalAmount: number;
    currentPrice: number;
    allowFractional?: boolean;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke('add-to-position', {
        body: params,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return { data, error: null };
    } catch (error: any) {
      console.error('Error adding to position:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Get trade price history
   */
  async getTradeHistory(tradeId: string) {
    try {
      const { data, error } = await supabase
        .from('trade_updates')
        .select('*')
        .eq('trade_id', tradeId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error: any) {
      console.error('Error fetching trade history:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Get notifications for user
   */
  async getNotifications(status?: string) {
    try {
      let query = supabase
        .from('trade_notifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;

      const notifications: TradeNotification[] = (data || []).map(n => ({
        id: n.id,
        tradeId: n.trade_id,
        type: n.type,
        title: n.title,
        message: n.message,
        status: n.status,
        createdAt: n.created_at,
        readAt: n.read_at
      }));

      return { data: notifications, error: null };
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: string) {
    try {
      const { error } = await supabase
        .from('trade_notifications')
        .update({ 
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      console.error('Error marking notification read:', error);
      return { error: error.message };
    }
  }

  /**
   * Square off an active trade via OpenAlgo (places real SELL order), then closes in DB.
   * This is the correct exit path when the user placed a real entry order.
   */
  async squareOff(tradeId: string): Promise<{ exitOrderId?: string; error: string | null }> {
    try {
      // Load trade details
      const { data: trade, error: fetchError } = await supabase
        .from('active_trades')
        .select('*')
        .eq('id', tradeId)
        .single();

      if (fetchError || !trade) {
        return { error: 'Trade not found' };
      }

      const exitAction = trade.action === 'BUY' ? 'SELL' : 'BUY';
      const exchange   = trade.exchange   || 'NSE';
      const product    = trade.product    || 'CNC';
      const shares     = trade.shares;

      // Place the exit order via OpenAlgo edge function
      const { data: orderData, error: orderErr } = await supabase.functions.invoke(
        'openalgo-place-order',
        {
          body: {
            symbol:    trade.symbol,
            action:    exitAction,
            quantity:  shares,
            exchange,
            product,
            pricetype: 'MARKET',
            strategy:  trade.strategy_type ? `ChartMate ${trade.strategy_type}` : 'ChartMate AI',
          },
        }
      );

      if (orderErr || (orderData as any)?.error) {
        return { error: (orderData as any)?.error || orderErr?.message || 'Exit order failed' };
      }

      const exitOrderId = (orderData as any)?.orderid ?? (orderData as any)?.order_id;
      const currentPrice = trade.current_price ?? trade.entry_price;
      const pnl = ((currentPrice - trade.entry_price) * shares) * (trade.action === 'SELL' ? -1 : 1);
      const pnlPct = (pnl / trade.investment_amount) * 100;

      // Mark trade as completed in DB
      await supabase
        .from('active_trades')
        .update({
          status:          'completed',
          exit_price:      currentPrice,
          exit_time:       new Date().toISOString(),
          exit_reason:     'user_squared_off',
          exit_order_id:   exitOrderId ?? null,
          actual_pnl:      pnl,
          actual_pnl_percentage: pnlPct,
        })
        .eq('id', tradeId);

      return { exitOrderId, error: null };
    } catch (e: any) {
      return { error: e?.message || 'Square off failed' };
    }
  }

  /**
   * Cancel an active trade (stop tracking without closing position)
   */
  async cancelTrade(tradeId: string) {
    try {
      const { error } = await supabase
        .from('active_trades')
        .update({ 
          status: 'cancelled',
          exit_time: new Date().toISOString(),
          exit_reason: 'user_cancelled'
        })
        .eq('id', tradeId);

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      console.error('Error cancelling trade:', error);
      return { error: error.message };
    }
  }

  /**
   * Close an active trade (exit position with current price)
   */
  async closeTrade(tradeId: string, currentPrice: number) {
    try {
      // First get the trade details
      const { data: trade, error: fetchError } = await supabase
        .from('active_trades')
        .select('*')
        .eq('id', tradeId)
        .single();

      if (fetchError || !trade) throw fetchError || new Error('Trade not found');

      // Calculate final P&L
      const pnl = (currentPrice - trade.entry_price) * trade.shares;
      const pnlPercentage = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;

      // Determine exit reason
      let exitReason = 'user_closed';
      if (trade.stop_loss_price && currentPrice <= trade.stop_loss_price) {
        exitReason = 'stop_loss_triggered';
      } else if (trade.take_profit_price && currentPrice >= trade.take_profit_price) {
        exitReason = 'target_hit';
      } else if (trade.expected_exit_time && new Date() >= new Date(trade.expected_exit_time)) {
        exitReason = 'holding_period_ended';
      }

      // Update trade as completed
      const { error } = await supabase
        .from('active_trades')
        .update({ 
          status: 'completed',
          exit_price: currentPrice,
          exit_time: new Date().toISOString(),
          exit_reason: exitReason,
          actual_pnl: pnl,
          actual_pnl_percentage: pnlPercentage
        })
        .eq('id', tradeId);

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      console.error('Error closing trade:', error);
      return { error: error.message };
    }
  }

  /**
   * Update prices for all active trades
   */
  async updateAllPrices() {
    try {
      const { data, error } = await supabase.functions.invoke('update-trade-prices', {
        body: {}
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error: any) {
      console.error('Error updating trade prices:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Subscribe to real-time updates for active trades
   */
  subscribeToTrades(callback: (payload: any) => void) {
    const subscription = supabase
      .channel('active_trades_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_trades'
        },
        (payload) => {
          console.log('Trade update:', payload);
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }

  /**
   * Subscribe to notifications
   */
  subscribeToNotifications(callback: (payload: any) => void) {
    const subscription = supabase
      .channel('trade_notifications_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trade_notifications'
        },
        (payload) => {
          console.log('New notification:', payload);
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }

  /**
   * Map database record to ActiveTrade interface
   */
  private mapDbToTrade(data: any): ActiveTrade {
    return {
      id: data.id,
      symbol: data.symbol,
      action: data.action,
      status: data.status,
      
      entryPrice: parseFloat(data.entry_price),
      entryTime: data.entry_time,
      shares: data.shares,
      investmentAmount: parseFloat(data.investment_amount),
      
      leverage: data.leverage,
      marginType: data.margin_type,

      exchange:      data.exchange    ?? 'NSE',
      product:       data.product     ?? 'CNC',
      brokerOrderId: data.broker_order_id ?? undefined,
      exitOrderId:   data.exit_order_id   ?? undefined,
      strategyType:  data.strategy_type   ?? undefined,

      stopLossPrice: data.stop_loss_price ? parseFloat(data.stop_loss_price) : undefined,
      takeProfitPrice: data.take_profit_price ? parseFloat(data.take_profit_price) : undefined,
      stopLossPercentage: data.stop_loss_percentage,
      targetProfitPercentage: data.target_profit_percentage,
      
      holdingPeriod: data.holding_period,
      aiRecommendedHoldPeriod: data.ai_recommended_hold_period,
      expectedExitTime: data.expected_exit_time,
      
      currentPrice: data.current_price ? parseFloat(data.current_price) : undefined,
      currentPnl: data.current_pnl ? parseFloat(data.current_pnl) : undefined,
      currentPnlPercentage: data.current_pnl_percentage ? parseFloat(data.current_pnl_percentage) : undefined,
      lastPriceUpdate: data.last_price_update,
      
      confidence: data.confidence,
      riskGrade: data.risk_grade,
      
      exitPrice: data.exit_price ? parseFloat(data.exit_price) : undefined,
      exitTime: data.exit_time,
      actualPnl: data.actual_pnl ? parseFloat(data.actual_pnl) : undefined,
      actualPnlPercentage: data.actual_pnl_percentage ? parseFloat(data.actual_pnl_percentage) : undefined,
      exitReason: data.exit_reason
    };
  }
}

export const tradeTrackingService = new TradeTrackingService();
