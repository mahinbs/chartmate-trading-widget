import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OutcomeBadge } from "./OutcomeBadge";
import { TrendingUp, TrendingDown, Minus, BarChart3, Brain, Target } from "lucide-react";

interface PostPredictionReportProps {
  symbol: string;
  timeframe?: string;
  evaluation?: {
    result: 'accurate' | 'partial' | 'failed';
    startPrice: number;
    endPrice: number;
    actualChangePercent: number;
    predictedDirection?: 'up' | 'down' | 'neutral' | null;
    predictedMovePercent?: number | null;
    reasoning?: string;
  };
  marketData?: {
    candleCount: number;
    source: string;
    interval: string;
  };
  ai?: {
    report?: {
      title: string;
      whatWePredicted: string;
      whatHappened: string;
      verdictExplanation: string;
      failureExcuse?: string | null;
      successExplanation?: string | null;
      keyFactors: string[];
      nextSteps: string[];
      confidenceNote: string;
    };
    rawText?: string;
  };
  dataSource?: string;
}

export function PostPredictionReport({
  symbol,
  timeframe,
  evaluation,
  marketData,
  ai,
  dataSource
}: PostPredictionReportProps) {
  const getDirectionIcon = (direction?: string) => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-yellow-600" />;
    }
  };

  const formatPrice = (price: number) => `$${price.toFixed(4)}`;
  const formatPercent = (percent: number) => `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;

  if (!evaluation && !ai?.report) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No analysis data available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {ai?.report && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-primary" />
                {ai.report.title}
              </CardTitle>
              {evaluation && <OutcomeBadge outcome={evaluation.result} size="lg" />}
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Prediction vs Reality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4" />
              What We Predicted
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ai?.report ? (
              <p className="text-sm">{ai.report.whatWePredicted}</p>
            ) : evaluation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {getDirectionIcon(evaluation.predictedDirection || undefined)}
                  <span className="text-sm font-medium">
                    {evaluation.predictedDirection || 'neutral'} move
                  </span>
                </div>
                {evaluation.predictedMovePercent && (
                  <p className="text-sm text-muted-foreground">
                    Expected: {formatPercent(evaluation.predictedMovePercent)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No prediction data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4" />
              What Happened
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ai?.report ? (
              <p className="text-sm">{ai.report.whatHappened}</p>
            ) : evaluation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {getDirectionIcon(evaluation.actualChangePercent >= 0 ? 'up' : 'down')}
                  <span className="text-sm font-medium">
                    {formatPercent(evaluation.actualChangePercent)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(evaluation.startPrice)} → {formatPrice(evaluation.endPrice)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No market data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metrics Grid */}
      {evaluation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Market Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Start Price</p>
                <p className="font-mono text-sm">{formatPrice(evaluation.startPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">End Price</p>
                <p className="font-mono text-sm">{formatPrice(evaluation.endPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Actual Move</p>
                <p className={`font-mono text-sm ${evaluation.actualChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(evaluation.actualChangePercent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data Points</p>
                <p className="font-mono text-sm">{marketData?.candleCount || 0}</p>
              </div>
            </div>
            {marketData && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Data: {marketData.source} ({marketData.interval})
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      {ai?.report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verdict Explanation */}
            <div>
              <h4 className="text-sm font-medium mb-2">Analysis</h4>
              <p className="text-sm text-muted-foreground">{ai.report.verdictExplanation}</p>
            </div>

            {/* Success/Failure Explanation */}
            {ai.report.successExplanation && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-green-600">Why It Worked</h4>
                <p className="text-sm text-muted-foreground">{ai.report.successExplanation}</p>
              </div>
            )}

            {ai.report.failureExcuse && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-orange-600">Why It Missed</h4>
                <p className="text-sm text-muted-foreground">{ai.report.failureExcuse}</p>
              </div>
            )}

            {/* Key Factors */}
            {ai.report.keyFactors?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Key Factors</h4>
                <ul className="space-y-1">
                  {ai.report.keyFactors.map((factor, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Steps */}
            {ai.report.nextSteps?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Next Steps</h4>
                <ul className="space-y-1">
                  {ai.report.nextSteps.map((step, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-accent mt-1">→</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confidence Note */}
            {ai.report.confidenceNote && (
              <div className="pt-4 border-t">
                <Badge variant="outline" className="text-xs">
                  {ai.report.confidenceNote}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Raw Data Source */}
      {dataSource && (
        <div className="text-xs text-muted-foreground text-center">
          Data source: {dataSource}
        </div>
      )}
    </div>
  );
}