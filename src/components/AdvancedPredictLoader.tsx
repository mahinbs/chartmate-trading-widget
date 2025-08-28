import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { BrainCircuit, TrendingUp, BarChart3, Search, Shield, Sparkles, Check } from "lucide-react";

interface AdvancedPredictLoaderProps {
  isVisible: boolean;
  symbol: string;
  timeframe: string;
  ready: boolean;
  onComplete: () => void;
}

const ANALYSIS_STEPS = [
  {
    id: "data",
    label: "Fetching Market Data",
    icon: Search,
    duration: 1200,
    description: "Retrieving real-time price data and historical patterns"
  },
  {
    id: "patterns",
    label: "Analyzing Patterns",
    icon: BarChart3,
    duration: 1800,
    description: "Identifying technical indicators and chart patterns"
  },
  {
    id: "sentiment",
    label: "Processing Sentiment",
    icon: TrendingUp,
    duration: 1500,
    description: "Analyzing market sentiment and news impact"
  },
  {
    id: "risk",
    label: "Risk Assessment",
    icon: Shield,
    duration: 1100,
    description: "Calculating risk factors and volatility metrics"
  },
  {
    id: "ai",
    label: "AI Model Processing",
    icon: BrainCircuit,
    duration: 1700,
    description: "Running neural network predictions"
  },
  {
    id: "final",
    label: "Finalizing Analysis",
    icon: Sparkles,
    duration: 900,
    description: "Compiling comprehensive prediction report"
  }
];

export function AdvancedPredictLoader({ isVisible, symbol, timeframe, ready, onComplete }: AdvancedPredictLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [telemetryLines, setTelemetryLines] = useState<Array<{ id: string; text: string; timestamp: number }>>([]);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setProgress(0);
      setCompletedSteps(new Set());
      setTelemetryLines([]);
      return;
    }

    let stepIndex = 0;
    let overallProgress = 0;
    const totalDuration = ANALYSIS_STEPS.reduce((sum, step) => sum + step.duration, 0);
    let accumulatedTime = 0;

    const processStep = () => {
      if (stepIndex >= ANALYSIS_STEPS.length) {
        // Hold at 95% until ready becomes true
        if (!ready) {
          setProgress(95);
          setTelemetryLines(prev => {
            const newLines = [...prev, {
              id: `waiting-${Date.now()}`,
              text: `Waiting for prediction results... ${symbol}`,
              timestamp: Date.now()
            }];
            return newLines.slice(-4);
          });
          // Check every 500ms if ready
          setTimeout(() => {
            if (ready) {
              setProgress(100);
              setTimeout(onComplete, 300);
            } else {
              processStep();
            }
          }, 500);
          return;
        }
        setProgress(100);
        setTimeout(onComplete, 300);
        return;
      }

      const step = ANALYSIS_STEPS[stepIndex];
      setCurrentStep(stepIndex);

      // Add telemetry line
      setTelemetryLines(prev => {
        const newLines = [...prev, {
          id: `${step.id}-${Date.now()}`,
          text: `${step.label}... ${Math.random() > 0.5 ? 'Processing' : 'Analyzing'} ${symbol}`,
          timestamp: Date.now()
        }];
        return newLines.slice(-4); // Keep only last 4 lines
      });

      // Animate progress for this step (stop at 95% for last step if not ready)
      const maxProgressForStep = stepIndex === ANALYSIS_STEPS.length - 1 && !ready ? 95 : 100;
      const stepProgressInterval = setInterval(() => {
        const stepProgress = (step.duration / totalDuration) * maxProgressForStep / 30; // 30 updates per step
        overallProgress += stepProgress;
        setProgress(Math.min(overallProgress, maxProgressForStep));
      }, step.duration / 30);

      setTimeout(() => {
        clearInterval(stepProgressInterval);
        setCompletedSteps(prev => new Set([...prev, stepIndex]));
        accumulatedTime += step.duration;
        stepIndex++;
        processStep();
      }, step.duration);
    };

    const startDelay = setTimeout(processStep, 200);

    return () => {
      clearTimeout(startDelay);
    };
  }, [isVisible, symbol, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-md pt-24 sm:pt-32">
      <div className="w-full max-w-xl mx-4 p-6 bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl max-h-[70vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="relative inline-block">
            <BrainCircuit className="h-10 w-10 text-primary mx-auto mb-3 animate-pulse" />
            <div className="absolute -inset-1 bg-primary/20 rounded-full blur animate-pulse"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">AI Analysis in Progress</h2>
          <p className="text-sm text-muted-foreground">
            Generating multi-horizon prediction for <span className="font-mono text-primary">{symbol}</span>
          </p>
        </div>

        {/* Progress Ring & Bar */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-center">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted stroke-current"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray={`${progress}, 100`}
                  className="text-primary stroke-current transition-all duration-300 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base font-bold">{Math.round(progress)}%</span>
              </div>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Analysis Steps */}
        <div className="mb-6 space-y-2 max-h-64 overflow-y-auto">
          {ANALYSIS_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = completedSteps.has(index);
            const isCurrent = currentStep === index;
            const isPending = index > currentStep;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg transition-all duration-300 ${
                  isCurrent ? 'bg-primary/10 border border-primary/20' : 
                  isCompleted ? 'bg-green-500/10 border border-green-500/20' :
                  'bg-muted/30'
                }`}
              >
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted ? 'bg-green-500 text-white' :
                  isCurrent ? 'bg-primary text-primary-foreground animate-pulse' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className={`h-3.5 w-3.5 ${isCurrent ? 'animate-pulse' : ''}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium transition-colors duration-300 ${
                    isCompleted ? 'text-green-600 dark:text-green-400' :
                    isCurrent ? 'text-primary' :
                    isPending ? 'text-muted-foreground' : 'text-foreground'
                  }`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {step.description}
                  </p>
                </div>
                {isCurrent && (
                  <div className="flex-shrink-0">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Telemetry */}
        <div className="bg-muted/30 rounded-xl p-3">
          <h3 className="text-xs font-medium mb-2 text-muted-foreground">Live Analysis Feed</h3>
          <div className="space-y-1 font-mono text-xs max-h-20 overflow-y-auto">
            {telemetryLines.map((line) => (
              <div
                key={line.id}
                className="flex items-center gap-2 text-muted-foreground animate-fade-in"
              >
                <span className="text-primary">›</span>
                <span className="flex-1">{line.text}</span>
                <span className="text-xs opacity-60">
                  {new Date(line.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
            {telemetryLines.length === 0 && (
              <div className="text-muted-foreground/60 italic">Initializing analysis systems...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}