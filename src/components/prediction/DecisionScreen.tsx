import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActionSignal } from "./ActionSignal";
import { RiskGrade } from "./RiskGrade";
import { formatCurrency, formatPercentage } from "@/lib/display-utils";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target,
  AlertTriangle,
  Clock,
  Package
} from "lucide-react";

interface DecisionScreenProps {
  symbol: string;
  currentPrice: number;
  investment: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  expectedROI: {
    best: number;
    likely: number;
    worst: number;
  };
  positionSize: {
    shares: number;
    costPerShare: number;
    totalCost: number;
  };
  recommendedHoldPeriod?: string;
  stopLoss: number;
  takeProfit: number;
  leverage?: number;
  /** Display currency for all amounts (INR or USD). Default USD. */
  currency?: "INR" | "USD";
}

export function DecisionScreen({
  symbol,
  currentPrice,
  investment,
  action,
  confidence,
  riskLevel,
  expectedROI,
  positionSize,
  recommendedHoldPeriod,
  stopLoss,
  takeProfit,
  leverage = 1,
  currency = "USD",
}: DecisionScreenProps) {
  const fmt = (amount: number, decimals = 2, allowNegative = false) =>
    formatCurrency(amount, decimals, allowNegative, currency);

  const bestCaseAmount = (investment * expectedROI.best) / 100;
  const likelyCaseAmount = (investment * expectedROI.likely) / 100;
  const worstCaseAmount = (investment * expectedROI.worst) / 100;

  const stopLossAmount = (investment * stopLoss) / 100;
  const takeProfitAmount = (investment * takeProfit) / 100;

  const getActionRecommendation = () => {
    if (action === 'BUY' && confidence >= 70) {
      return {
        text: 'TRADE NOW',
        urgency: 'HIGH',
        color: 'bg-green-600 hover:bg-green-700',
        reason: 'Strong buy signal with high confidence',
        explanation: `AI detected strong upward momentum with ${confidence}% confidence. Multiple technical indicators align for a bullish move. Risk level is ${riskLevel.toLowerCase()}.`
      };
    } else if (action === 'BUY' && confidence >= 50) {
      return {
        text: 'TRADE WITH CAUTION',
        urgency: 'MEDIUM',
        color: 'bg-yellow-600 hover:bg-yellow-700',
        reason: 'Moderate confidence - consider smaller position',
        explanation: `AI shows moderate buy signal with ${confidence}% confidence. Some indicators are positive but not all align. Consider reducing position size or waiting.`
      };
    } else if (action === 'SELL') {
      return {
        text: 'AVOID OR EXIT',
        urgency: 'HIGH',
        color: 'bg-red-600 hover:bg-red-700',
        reason: 'Bearish signal detected',
        explanation: `AI detected downward pressure with ${confidence}% confidence. Technical indicators suggest potential decline. Consider shorting or avoiding this position.`
      };
    } else {
      return {
        text: 'WAIT',
        urgency: 'LOW',
        color: 'bg-gray-600 hover:bg-gray-700',
        reason: 'Market unclear - wait for better setup',
        explanation: `AI recommends HOLD with only ${confidence}% confidence. Signals are mixed or unclear - entering now carries ${riskLevel.toLowerCase()} risk with uncertain reward. Wait for ${confidence < 40 ? 'much stronger' : 'stronger'} confirmation before committing capital.`
      };
    }
  };

  const recommendation = getActionRecommendation();

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Investment Decision</CardTitle>
          <div className="flex gap-2">
            <ActionSignal action={action} confidence={confidence} size="lg" />
            <RiskGrade level={riskLevel} size="lg" />
          </div>
        </div>
        
        {/* WHY THIS SIGNAL - Prominent Explanation */}
        <Alert className={`mt-4 ${
          action === 'BUY' ? 'border-green-500/30 bg-green-500/10' : 
          action === 'SELL' ? 'border-red-500/30 bg-red-500/10' : 
          'border-amber-500/30 bg-amber-500/10'
        }`}>
          <AlertTriangle className={`h-4 w-4 ${
            action === 'BUY' ? 'text-green-600' : 
            action === 'SELL' ? 'text-red-600' : 
            'text-amber-600'
          }`} />
          <AlertDescription>
            <p className={`font-bold text-sm mb-1 ${
              action === 'BUY' ? 'text-green-700 dark:text-green-400' : 
              action === 'SELL' ? 'text-red-700 dark:text-red-400' : 
              'text-amber-700 dark:text-amber-400'
            }`}>
              Why {action}?
            </p>
            <p className="text-sm text-muted-foreground">
              {recommendation.explanation}
            </p>
          </AlertDescription>
        </Alert>
      </CardHeader>
      
      <CardContent className="space-y-6">
        
        {/* Main Investment Scenario */}
        <div className="p-6 bg-muted/50 rounded-lg border-2 border-primary/20">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            If You Invest {fmt(investment, 0)} Today
          </h3>
          
          <div className="grid grid-cols-3 gap-4">
            {/* Best Case - use 2 decimals so small investments (e.g. ₹10) don't show ₹0 */}
            <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <div className="text-xs text-muted-foreground mb-1">BEST CASE</div>
              <div className="text-2xl font-bold text-green-600">
                {fmt(bestCaseAmount, 2)}
              </div>
              <div className="text-sm text-green-600 font-medium">
                ({formatPercentage(expectedROI.best)})
              </div>
            </div>

            {/* Likely Case */}
            <div className="text-center p-4 bg-blue-500/10 rounded-lg border-2 border-blue-500/50">
              <div className="text-xs text-muted-foreground mb-1">LIKELY</div>
              <div className="text-2xl font-bold text-blue-600">
                {fmt(likelyCaseAmount, 2)}
              </div>
              <div className="text-sm text-blue-600 font-medium">
                ({formatPercentage(expectedROI.likely)})
              </div>
            </div>

            {/* Worst Case */}
            <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <div className="text-xs text-muted-foreground mb-1">WORST CASE</div>
              <div className="text-2xl font-bold text-red-600">
                {fmt(worstCaseAmount, 2, true)}
              </div>
              <div className="text-sm text-red-600 font-medium">
                ({formatPercentage(expectedROI.worst)})
              </div>
            </div>
          </div>
        </div>

        {/* Position Sizing */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-primary" />
              <h4 className="font-semibold">Position Size</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shares to buy:</span>
                <span className="font-bold">{positionSize.shares}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price per share:</span>
                <span className="font-medium">{fmt(positionSize.costPerShare, 2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Total cost:</span>
                <span className="font-bold">{fmt(positionSize.totalCost, 2)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-primary" />
              <h4 className="font-semibold">Risk Management</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stop Loss:</span>
                <span className="font-bold text-red-600">-{fmt(stopLossAmount, 0)} ({formatPercentage(stopLoss, 0, false)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Take Profit:</span>
                <span className="font-bold text-green-600">+{fmt(takeProfitAmount, 0)} ({formatPercentage(takeProfit, 0, false)})</span>
              </div>
              {leverage > 1 && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">Leverage:</span>
                  <span className="font-bold text-orange-600">{leverage}x</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Holding Period */}
        {recommendedHoldPeriod && (
          <Alert className="border-primary/30 bg-primary/5">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">Recommended Holding Period:</span>{' '}
              <span className="text-primary font-bold">{recommendedHoldPeriod}</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Leverage Warning */}
        {leverage > 1 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">Leverage Warning:</span> {leverage}x leverage amplifies both 
              gains and losses. A {(100/leverage).toFixed(1)}% adverse move could wipe out your position.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Button */}
        <div className="space-y-3">
          <Button 
            className={`w-full text-lg py-6 ${recommendation.color}`}
            size="lg"
          >
            {recommendation.text}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {recommendation.reason}
          </p>
        </div>

        {/* One-Line Summary */}
        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 text-center">
          <p className="font-semibold text-sm">
            {action === 'BUY' && `${action} ${symbol} at ${fmt(currentPrice, 2)} with ${recommendedHoldPeriod || '1 week'} hold for ${formatPercentage(expectedROI.likely, 0, false)} gain`}
            {action === 'SELL' && `${action} ${symbol} - bearish outlook`}
            {action === 'HOLD' && `${action} ${symbol} - wait for better opportunity`}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
