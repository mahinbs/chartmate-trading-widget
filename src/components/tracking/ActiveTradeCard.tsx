import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CountdownTimer } from "./CountdownTimer";
import { ActionSignal } from "../prediction/ActionSignal";
import { RiskGrade } from "../prediction/RiskGrade";
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  X,
  ExternalLink,
  CheckCircle
} from "lucide-react";
import { ActiveTrade } from "@/services/tradeTrackingService";
import { cn } from "@/lib/utils";

interface ActiveTradeCardProps {
  trade: ActiveTrade;
  onCancel?: (tradeId: string) => void;
  onClose?: (tradeId: string) => void;
  onViewDetails?: (tradeId: string) => void;
}

export function ActiveTradeCard({ trade, onCancel, onClose, onViewDetails }: ActiveTradeCardProps) {
  const isProfitable = (trade.currentPnl || 0) >= 0;
  const isNearStopLoss = trade.stopLossPrice && trade.currentPrice && 
    Math.abs(trade.currentPrice - trade.stopLossPrice) / trade.stopLossPrice < 0.05;
  const isNearTarget = trade.takeProfitPrice && trade.currentPrice &&
    Math.abs(trade.currentPrice - trade.takeProfitPrice) / trade.takeProfitPrice < 0.05;

  const getStatusBadge = () => {
    switch (trade.status) {
      case 'active':
        return <Badge variant="default" className="bg-blue-500">Active</Badge>;
      case 'monitoring':
        return <Badge variant="default" className="bg-yellow-500">Monitoring</Badge>;
      case 'exit_zone':
        return <Badge variant="destructive">Exit Zone</Badge>;
      default:
        return <Badge variant="outline">{trade.status}</Badge>;
    }
  };

  return (
    <Card className={cn(
      "relative overflow-hidden",
      trade.status === 'exit_zone' && "border-orange-500 border-2"
    )}>
      {/* Status Indicator Bar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1",
        trade.status === 'active' && "bg-blue-500",
        trade.status === 'monitoring' && "bg-yellow-500",
        trade.status === 'exit_zone' && "bg-orange-500"
      )} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-2xl font-bold">{trade.symbol}</CardTitle>
            <ActionSignal 
              action={trade.action} 
              confidence={trade.confidence || 0} 
              size="sm"
            />
            {trade.riskGrade && (
              <RiskGrade level={trade.riskGrade as any} size="sm" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {onCancel && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCancel(trade.id)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        
        {/* P&L Display - Prominent */}
        <div className={cn(
          "p-4 rounded-lg border-2 transition-all duration-300",
          isProfitable ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current P&L</p>
              <p className={cn(
                "text-3xl font-bold transition-all duration-300",
                isProfitable ? "text-green-600" : "text-red-600"
              )}>
                {isProfitable ? '+' : ''}${(trade.currentPnl || 0).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Percentage</p>
              <p className={cn(
                "text-2xl font-bold transition-all duration-300",
                isProfitable ? "text-green-600" : "text-red-600"
              )}>
                {isProfitable ? '+' : ''}{(trade.currentPnlPercentage || 0).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Price Info */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-muted-foreground mb-1">Entry</p>
            <p className="font-semibold">${trade.entryPrice.toFixed(2)}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-muted-foreground mb-1">Current</p>
            <p className="font-semibold">${trade.currentPrice?.toFixed(2) || trade.entryPrice.toFixed(2)}</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-muted-foreground mb-1">Shares</p>
            <p className="font-semibold">{trade.shares}</p>
          </div>
        </div>

        {/* Targets */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(
            "p-3 rounded-lg border",
            isNearStopLoss && "border-red-500 bg-red-500/10"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <p className="text-xs text-muted-foreground">Stop Loss</p>
            </div>
            <p className="text-lg font-bold text-red-600">
              ${trade.stopLossPrice?.toFixed(2) || 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">
              -{trade.stopLossPercentage}%
            </p>
          </div>

          <div className={cn(
            "p-3 rounded-lg border",
            isNearTarget && "border-green-500 bg-green-500/10"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-green-500" />
              <p className="text-xs text-muted-foreground">Take Profit</p>
            </div>
            <p className="text-lg font-bold text-green-600">
              ${trade.takeProfitPrice?.toFixed(2) || 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">
              +{trade.targetProfitPercentage}%
            </p>
          </div>
        </div>

        {/* Countdown Timer */}
        {trade.expectedExitTime && (
          <CountdownTimer 
            targetTime={trade.expectedExitTime}
            label="Holding Period"
            size="md"
          />
        )}

        {/* Alerts */}
        {isNearStopLoss && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Warning:</strong> Price is within 5% of stop loss!
            </AlertDescription>
          </Alert>
        )}

        {isNearTarget && (
          <Alert className="border-green-500 bg-green-500/10">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-600">
              <strong>Target Approaching:</strong> Price is within 5% of take profit!
            </AlertDescription>
          </Alert>
        )}

        {trade.status === 'exit_zone' && (
          <Alert className="border-orange-500 bg-orange-500/10">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm text-orange-600">
              <strong>Exit Zone:</strong> Holding period is almost complete. Consider closing position.
            </AlertDescription>
          </Alert>
        )}

        {/* Leverage Warning */}
        {trade.leverage && trade.leverage > 1 && (
          <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-sm">
              {trade.leverage}x leverage active - P&L is amplified
            </AlertDescription>
          </Alert>
        )}

        {/* Trade Details */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <div className="flex justify-between">
            <span>Investment:</span>
            <span className="font-medium">${trade.investmentAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Account Type:</span>
            <span className="font-medium capitalize">{trade.marginType || 'cash'}</span>
          </div>
          <div className="flex justify-between">
            <span>Holding Period:</span>
            <span className="font-medium">
              {trade.holdingPeriod === 'none' || (!trade.holdingPeriod && !trade.aiRecommendedHoldPeriod)
                ? 'Unlimited ∞' 
                : (trade.holdingPeriod || trade.aiRecommendedHoldPeriod)
              }
            </span>
          </div>
          <div className="flex justify-between">
            <span>Entry Time:</span>
            <span className="font-medium">{new Date(trade.entryTime).toLocaleString()}</span>
          </div>
          {trade.lastPriceUpdate && (
            <div className="flex justify-between">
              <span>Last Update:</span>
              <span className="font-medium">{new Date(trade.lastPriceUpdate).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {onViewDetails && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onViewDetails(trade.id)}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on TradingView
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            {onClose && (
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => onClose(trade.id)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Close Trade
              </Button>
            )}
            {onCancel && (
              <Button
                variant="destructive"
                onClick={() => onCancel(trade.id)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
