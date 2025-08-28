import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  Loader2, 
  Activity,
  TrendingUp,
  BarChart3,
  Brain,
  AlertTriangle,
  Timer
} from "lucide-react";
import { formatDuration, formatTimeRemaining, calculateHorizonTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime?: number;
  endTime?: number;
  duration?: number;
  details?: string;
}

interface PipelineMeta {
  totalDuration: number;
  steps: PipelineStep[];
  startTime: number;
  endTime: number;
}

interface HorizonForecast {
  horizon: string;
  direction: "up" | "down" | "sideways";
  probabilities: { up: number; down: number; sideways: number };
  expected_return_bp: number;
  confidence: number;
}

interface PredictionTimelineProps {
  pipeline?: PipelineMeta;
  forecasts?: HorizonForecast[];
  predictedAt?: Date;
}

const stepIcons: Record<string, any> = {
  symbol_validation: CheckCircle,
  market_data_fetch: BarChart3,
  historical_analysis: TrendingUp,
  news_sentiment: Activity,
  technical_indicators: BarChart3,
  ai_prediction: Brain,
  multi_horizon_forecast: Timer,
  risk_assessment: AlertTriangle
};

const stepLabels: Record<string, string> = {
  symbol_validation: "Symbol Validation",
  market_data_fetch: "Market Data",
  historical_analysis: "Historical Analysis", 
  news_sentiment: "News Sentiment",
  technical_indicators: "Technical Indicators",
  ai_prediction: "AI Analysis",
  multi_horizon_forecast: "Multi-Horizon Forecast",
  risk_assessment: "Risk Assessment"
};

export function PredictionTimeline({ 
  pipeline, 
  forecasts = [],
  predictedAt = new Date()
}: PredictionTimelineProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!pipeline?.steps) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Prediction Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No pipeline data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedSteps = pipeline.steps.filter(step => step.status === 'completed').length;
  const totalSteps = pipeline.steps.length;
  const progressPercent = (completedSteps / totalSteps) * 100;

  return (
    <div className="space-y-4">
      {/* Pipeline Progress Overview */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Pipeline Progress
            </div>
            <Badge variant="outline" className="text-xs">
              {formatDuration(pipeline.totalDuration || 0)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{completedSteps}/{totalSteps} steps</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Pipeline Steps */}
          <div className="grid gap-2">
            {pipeline.steps.map((step, index) => {
              const Icon = stepIcons[step.name] || Clock;
              const isCompleted = step.status === 'completed';
              const isRunning = step.status === 'running';
              const isError = step.status === 'error';

              return (
                <div
                  key={step.name}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                    isCompleted && "bg-green-100/50 border border-green-200/50",
                    isRunning && "bg-blue-100/50 border border-blue-200/50 animate-pulse",
                    isError && "bg-red-100/50 border border-red-200/50",
                    !isCompleted && !isRunning && !isError && "bg-muted/20"
                  )}
                >
                  <div className={cn(
                    "flex-shrink-0 p-1.5 rounded-full",
                    isCompleted && "bg-green-500 text-white",
                    isRunning && "bg-blue-500 text-white",
                    isError && "bg-red-500 text-white",
                    !isCompleted && !isRunning && !isError && "bg-muted text-muted-foreground"
                  )}>
                    {isRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isError ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {stepLabels[step.name] || step.name}
                      </span>
                      {step.duration && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(step.duration)}
                        </span>
                      )}
                    </div>
                    {step.details && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {step.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Live Horizon Countdown */}
      {forecasts.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Live Horizon Countdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {forecasts.map((forecast) => {
                const targetTime = calculateHorizonTime(forecast.horizon, predictedAt);
                const timeRemaining = formatTimeRemaining(targetTime, currentTime);
                const isExpired = targetTime.getTime() <= currentTime.getTime();

                return (
                  <div
                    key={forecast.horizon}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      isExpired ? "bg-red-50/50 border-red-200/50" : "bg-blue-50/50 border-blue-200/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={isExpired ? "destructive" : "secondary"}>
                        {forecast.horizon}
                      </Badge>
                      <div className="text-sm">
                        <div className="font-medium">
                          {forecast.direction === 'up' ? '↗️' : forecast.direction === 'down' ? '↘️' : '↔️'} 
                          {' '}
                          {(forecast.expected_return_bp / 100).toFixed(2)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {forecast.confidence}% confidence
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={cn(
                        "text-sm font-mono",
                        isExpired ? "text-red-600" : "text-blue-600"
                      )}>
                        {timeRemaining}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isExpired ? "Results available" : "remaining"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {pipeline.steps.filter(s => s.status === 'completed').length}
              </div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {pipeline.steps.filter(s => s.status === 'running').length}
              </div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {pipeline.steps.filter(s => s.status === 'error').length}
              </div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}