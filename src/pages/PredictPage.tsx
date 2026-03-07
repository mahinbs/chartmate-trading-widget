import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ChartPanel from "@/components/ChartPanel";
import { AdvancedPredictLoader } from "@/components/AdvancedPredictLoader";
import { PredictionTimeline } from "@/components/PredictionTimeline";
import { Stepper } from "@/components/ui/stepper";
import { StepContainer } from "@/components/ui/step-container";
import { SummaryHeader } from "@/components/prediction/SummaryHeader";
import { ForecastTable } from "@/components/prediction/ForecastTable";
import { KeyLevels } from "@/components/prediction/KeyLevels";
import { Insights } from "@/components/prediction/Insights";
import { NewsAnalysis } from "@/components/news/NewsAnalysis";
import { MarketStatus } from "@/components/market/MarketStatus";
import { UserProfileForm, UserProfile } from "@/components/prediction/UserProfileForm";
import { DecisionScreen } from "@/components/prediction/DecisionScreen";
import { LeverageSimulator } from "@/components/prediction/LeverageSimulator";
import { RegulatoryDisclaimer } from "@/components/prediction/RegulatoryDisclaimer";
import { ActionSignal } from "@/components/prediction/ActionSignal";
import { RiskGrade } from "@/components/prediction/RiskGrade";
import { AIReasoningDisplay } from "@/components/prediction/AIReasoningDisplay";
import { CapitalScenarios } from "@/components/prediction/CapitalScenarios";
import { MarketConditionsDashboard } from "@/components/market/MarketConditionsDashboard";
import { PerformanceDashboard } from "@/components/performance/PerformanceDashboard";
import { supabase } from "@/integrations/supabase/client";
import type { SymbolData } from "@/components/SymbolSearch";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTradingIntegration } from "@/hooks/useTradingIntegration";
import { TradingIntegrationModal } from "@/components/trading/TradingIntegrationModal";
import { StrategySelectionDialog, STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { UsePreviousOrNewStrategyDialog } from "@/components/trading/UsePreviousOrNewStrategyDialog";
import { toast } from "sonner";
import { Loader2, AlertTriangle, BrainCircuit, BarChart3, CheckCircle, ArrowRight, DollarSign, LogOut, History, Timer, Home, FlaskConical } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { formatCurrency } from "@/lib/display-utils";
import { getTradingViewSymbol } from "@/lib/tradingview-symbols";

interface GeminiForecast {
  symbol: string;
  as_of: string;
  forecasts: Array<{
    horizon: string;
    direction: "up" | "down" | "sideways";
    probabilities: { up: number; down: number; sideways: number };
    expected_return_bp: number;
    expected_range_bp: { p10: number; p50: number; p90: number };
    key_drivers: string[];
    risk_flags: string[];
    confidence: number;
    invalid_if: string[];
  }>;
  support_resistance: {
    supports: Array<{ level: number; strength: number }>;
    resistances: Array<{ level: number; strength: number }>;
  };
  positioning_guidance: {
    bias: "long" | "short" | "flat";
    notes: string;
    recommended_hold_period?: string;
  };
  // Enhanced decision-making fields
  action_signal?: {
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    urgency: "HIGH" | "MEDIUM" | "LOW";
  };
  risk_grade?: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  expected_roi?: {
    best_case: number;
    likely_case: number;
    worst_case: number;
  };
  // NEW: Deep analysis fields
  deep_analysis?: {
    bullish_case?: string;
    bearish_case?: string;
    contrarian_view?: string;
    conviction_rationale?: string;
    invalidation_triggers?: string[];
    risk_reward_ratio?: number;
    success_probability?: number;
  };
  market_context?: {
    correlation_insight?: string;
    sector_strength?: string;
    macro_factors?: string;
    institutional_activity?: string;
  };
}

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

interface PredictionResult {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  timeframe: string;
  analysis: string;
  stockData: {
    currentPrice: number;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    previousClose: number;
    change: number;
    changePercent: number;
  };
  geminiForecast?: GeminiForecast;
  meta?: {
    pipeline?: PipelineMeta;
  };
  // Legacy structured fields for backward compatibility
  recommendation?: "bullish" | "bearish" | "neutral";
  confidence?: number;
  expectedMove?: {
    percent?: number;
    direction?: "up" | "down" | "flat";
    priceTarget?: {
      min: number;
      max: number;
    };
  };
  patterns?: string[];
  keyLevels?: {
    support?: number[];
    resistance?: number[];
  };
  risks?: string[];
  opportunities?: string[];
  rationale?: string;
  // Enhanced decision-making fields
  positionSize?: {
    shares: number;
    costPerShare: number;
    totalCost: number;
    remainingCash?: number;
  };
  leverage?: number;
  marginType?: string;
}

interface PredictionPreset {
  symbol: string | null;
  timeframe: string | null;
  custom_timeframe: string | null;
  investment: number | null;
  profile: Partial<UserProfile> | null;
}

const PredictPage = () => {
  const [symbol, setSymbol] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolData | null>(null);
  const [investment, setInvestment] = useState("");
  const [userProfile, setUserProfile] = useState<Partial<UserProfile>>({
    riskTolerance: 'medium',
    tradingStyle: 'swing_trading',
    investmentGoal: 'growth',
    stopLossPercentage: 5,
    targetProfitPercentage: 15,
    marginType: 'cash',
    leverage: 1
  });
  const [chartInterval, setChartInterval] = useState("15");
  const [timeframe, setTimeframe] = useState("1h"); // User-selectable timeframe
  const [customTimeframe, setCustomTimeframe] = useState(""); // For custom timeframe input
  const [currentStep, setCurrentStep] = useState("choose-asset");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdvancedLoader, setShowAdvancedLoader] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [chartAnalysisLoading, setChartAnalysisLoading] = useState(false);
  const [chartAnalysis, setChartAnalysis] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState("NASDAQ:AAPL");
  const [chartDataSource, setChartDataSource] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<any>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [predictedAt, setPredictedAt] = useState<Date | null>(null);
  const [marketTimeZone, setMarketTimeZone] = useState<string | null>(null);
  const [latestPreset, setLatestPreset] = useState<PredictionPreset | null>(null);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetChecked, setPresetChecked] = useState(false);
  // Have we already asked \"use previous details?\" in this flow (after symbol + investment)?
  const [presetPromptShown, setPresetPromptShown] = useState(false);
  
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasIntegration, save: saveTradingIntegration, refresh: refreshTradingIntegration } = useTradingIntegration();
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [showStrategyDialog, setShowStrategyDialog]     = useState(false);
  const [showPreviousOrNewDialog, setShowPreviousOrNewDialog] = useState(false);
  const [lastUsedStrategy, setLastUsedStrategy]         = useState<{ strategyType: string; product: string; label: string } | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  const [isPaperTrade, setIsPaperTrade] = useState(false);

  // ── Mock / Paper order + track ────────────────────────────────────────────
  const placeMockOrderAndTrack = useCallback(async (strategyCode: string, product: string) => {
    if (!result) return;
    const prefix = isPaperTrade ? 'PAPER' : 'MOCK';
    const mockOrderId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const action = result.geminiForecast?.action_signal?.action === 'SELL' ? 'SELL' : 'BUY';
    const shares = Math.floor(result.positionSize?.shares || 0) || 1;
    const aiRecommendedPeriod = result.geminiForecast?.positioning_guidance?.recommended_hold_period;
    const userChosenPeriod    = userProfile.userHoldingPeriod;
    const effectiveHoldingPeriod = !userChosenPeriod || userChosenPeriod === 'ai_recommendation'
      ? aiRecommendedPeriod
      : userChosenPeriod === 'none' ? null : userChosenPeriod;

    toast.loading("Placing order…", { id: 'trade-start' });
    try {
      const { tradeTrackingService } = await import("@/services/tradeTrackingService");
      const response = await tradeTrackingService.startTradeSession({
        symbol:                  result.symbol,
        action,
        confidence:              result.geminiForecast?.action_signal?.confidence || result.confidence || 0,
        riskGrade:               result.geminiForecast?.risk_grade || 'MEDIUM',
        entryPrice:              result.currentPrice,
        shares,
        investmentAmount:        parseFloat(investment),
        leverage:                userProfile.leverage,
        marginType:              userProfile.marginType,
        exchange:                'NSE',
        product,
        brokerOrderId:           mockOrderId,
        strategyType:            strategyCode,
        stopLossPercentage:      userProfile.stopLossPercentage || 5,
        targetProfitPercentage:  userProfile.targetProfitPercentage || 15,
        holdingPeriod:           effectiveHoldingPeriod,
        aiRecommendedHoldPeriod: aiRecommendedPeriod,
        expectedRoiBest:         result.geminiForecast?.expected_roi?.best_case,
        expectedRoiLikely:       result.geminiForecast?.expected_roi?.likely_case,
        expectedRoiWorst:        result.geminiForecast?.expected_roi?.worst_case,
      });
      if (response.error) {
        toast.error('Tracking failed: ' + response.error, { id: 'trade-start' });
      } else {
        const label = isPaperTrade ? `Paper trade started (${mockOrderId})` : `Order placed (${mockOrderId}). Tracking started!`;
        toast.success(label, { id: 'trade-start' });
        setTimeout(() => navigate('/active-trades'), 1000);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed', { id: 'trade-start' });
    }
  }, [result, investment, userProfile, navigate, isPaperTrade]);

  // Fetch market status when symbol is selected
  useEffect(() => {
    const fetchMarketStatus = async () => {
      if (!selectedSymbol) {
        setMarketStatus(null);
        setMarketClosed(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('get-market-status', {
          body: { 
            symbol: selectedSymbol.full_symbol || selectedSymbol.symbol,
            exchange: selectedSymbol.exchange,
            type: selectedSymbol.type
          }
        });

        if (!error && data) {
          setMarketStatus(data);
          setMarketClosed(data.marketState === 'CLOSED' || data.marketState === 'PRE' || data.marketState === 'POST');
        }
      } catch (err) {
        console.error('Failed to fetch market status:', err);
      }
    };

    fetchMarketStatus();
  }, [selectedSymbol]);

  const applyPreset = (preset: PredictionPreset, keepSymbol = false) => {
    const presetCurrency = (preset.profile as { displayCurrency?: "INR" | "USD" })?.displayCurrency;
    if (presetCurrency) setDisplayCurrency(presetCurrency);

    if (!keepSymbol) {
      setSymbol("");
      setInvestment("");
      setSelectedSymbol(null);
      if (preset.investment != null) setInvestment(String(preset.investment));
    } else {
      if (preset.investment != null) setInvestment(String(preset.investment));
    }
    setTimeframe(preset.timeframe || "1h");
    setCustomTimeframe(preset.custom_timeframe || "");
    if (preset.profile) {
      setUserProfile((prev) => ({
        ...prev,
        ...preset.profile,
        riskAcceptance: false,
      }));
    } else {
      setUserProfile((prev) => ({ ...prev, riskAcceptance: false }));
    }
  };

  const resetPredictionForm = (clearAll: boolean = true) => {
    setCurrentStep("choose-asset");
    setCompletedSteps([]);
    setResult(null);
    setSelectedSymbol(null);
    setMarketStatus(null);
    setPredictedAt(null);

    if (clearAll) {
      setSymbol("");
      setInvestment("");
      setTimeframe("1h");
      setCustomTimeframe("");
    }
  };

  const loadLatestPreset = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("user_prediction_presets" as any)
        .select("symbol, timeframe, custom_timeframe, investment, profile")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading user preset:", error);
        return;
      }

      if (data) {
        setLatestPreset(data as unknown as PredictionPreset);
        // Dialog is shown only after user fills symbol and clicks Continue (see handleNextStep)
      }
    } catch (error) {
      console.error("Failed to load latest preset:", error);
    } finally {
      setPresetChecked(true);
    }
  };

  const saveLatestPreset = async () => {
    if (!user?.id) return;
    try {
      const payload = {
        user_id: user.id,
        symbol: symbol || null,
        timeframe: timeframe || null,
        custom_timeframe: timeframe === "custom" ? customTimeframe || null : null,
        investment: investment ? parseFloat(investment) : null,
        profile: { ...userProfile, displayCurrency },
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("user_prediction_presets" as any)
        .upsert(payload, { onConflict: "user_id" });

      if (error) {
        console.error("Error saving user preset:", error);
      } else {
        setLatestPreset({
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          custom_timeframe: payload.custom_timeframe,
          investment: payload.investment,
          profile: payload.profile as PredictionPreset["profile"],
        });
      }
    } catch (error) {
      console.error("Failed to save latest preset:", error);
    }
  };

  const startNewPredictionFlow = () => {
    resetPredictionForm(false);
    setSymbol("");
    setInvestment("");
    setSelectedSymbol(null);
    setUserProfile((prev) => ({ ...prev, riskAcceptance: false }));
    resetPredictionForm(true);
    setPresetPromptShown(false);
    // Preset dialog is shown only after user fills symbol and clicks Continue to Investment
  };

  useEffect(() => {
    if (!user?.id || presetChecked) return;
    loadLatestPreset();
  }, [user?.id, presetChecked]);

  const steps = [
    { id: "choose-asset", title: "Choose Asset", description: "Select symbol" },
    { id: "set-investment", title: "Set Investment", description: "Amount to invest" },
    { id: "trading-profile", title: "Trading Profile", description: "Risk & preferences" },
    { id: "review", title: "Review & Start", description: "Confirm details" },
    { id: "analysis", title: "Live Analysis", description: "AI processing" },
    { id: "results", title: "Results", description: "View analysis" }
  ];

  // Auto-save prediction to database
  const savePrediction = async (predictionData: PredictionResult) => {
    try {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from('predictions' as any)
        .insert({
          user_id: user.id,
          symbol: predictionData.symbol,
          timeframe,
          investment: parseFloat(investment),
          current_price: predictionData.currentPrice,
          recommendation: predictionData.recommendation || null,
          confidence: predictionData.confidence || null,
          expected_move_direction: predictionData.expectedMove?.direction || null,
          expected_move_percent: predictionData.expectedMove?.percent || null,
          price_target_min: predictionData.expectedMove?.priceTarget?.min || null,
          price_target_max: predictionData.expectedMove?.priceTarget?.max || null,
          rationale: predictionData.rationale || null,
          patterns: predictionData.patterns || null,
          key_levels: predictionData.keyLevels || null,
          risks: predictionData.risks || null,
          opportunities: predictionData.opportunities || null,
          raw_response: {
            ...predictionData,
            geminiForecast: predictionData.geminiForecast
          }
        });

      if (error) {
        console.error('Error saving prediction:', error);
      }
    } catch (error) {
      console.error('Error saving prediction:', error);
    }
  };

  const handleNextStep = () => {
    if (currentStep === "choose-asset" && symbol) {
      // Step 1 → Step 2 (no preset prompt yet; we only ask after amount is filled)
      setCompletedSteps(prev => [...prev, "choose-asset"]);
      setCurrentStep("set-investment");
    } else if (currentStep === "set-investment" && investment) {
      // After user has chosen symbol + investment, ask if they want previous details
      if (latestPreset && !presetPromptShown) {
        setShowPresetDialog(true);
        setPresetPromptShown(true);
        return;
      }
      setCompletedSteps(prev => [...prev, "set-investment"]);
      setCurrentStep("trading-profile");
    } else if (currentStep === "trading-profile") {
      setCompletedSteps(prev => [...prev, "trading-profile"]);
      setCurrentStep("review");
    } else if (currentStep === "review") {
      setCompletedSteps(prev => [...prev, "review"]);
      setCurrentStep("analysis");
      handlePredict();
    }
  };

  // Convert timeframe to minutes for API
  const getTimeframeMinutes = (tf: string): number => {
    const match = tf.match(/^(\d+)([mhd]|w)$/);
    if (!match) return 60; // Default 1h
    const [, value, unit] = match;
    const num = parseInt(value);
    switch (unit) {
      case 'm': return num;
      case 'h': return num * 60;
      case 'd': return num * 1440;
      case 'w': return num * 10080;
      default: return 60;
    }
  };

  const handlePredict = async () => {
    if (!symbol || !investment) {
      toast.error("Please fill in all fields");
      return;
    }

    // Validate and get effective timeframe
    const effectiveTimeframe = timeframe === 'custom' && customTimeframe ? customTimeframe : timeframe;
    if (timeframe === 'custom' && !customTimeframe) {
      toast.error("Please enter a custom timeframe");
      return;
    }

    setLoading(true);
    setShowAdvancedLoader(true);
    setAnalysisReady(false);
    setResult(null);

    try {
      const primaryHorizon = getTimeframeMinutes(effectiveTimeframe);
      const { data, error } = await supabase.functions.invoke('predict-movement', {
        body: {
          symbol: symbol.split(':')[1] || symbol,
          investment: parseFloat(investment),
          timeframe: effectiveTimeframe,
          horizons: [primaryHorizon, 240, 1440, 10080], // Primary + 4h, 1d, 1w
          // Include user profile for personalized AI analysis
          ...userProfile
        }
      });

      if (error) {
        console.error("Analysis error:", error);
        setShowAdvancedLoader(false);
        toast.error("Failed to get analysis. Please try again.");
        return;
      }

      setResult(data);
      setAnalysisReady(true);
      setPredictedAt(new Date()); // Capture stable timestamp
      
      // Fetch market status for the symbol
      await fetchMarketStatus(symbol.split(':')[1] || symbol, selectedSymbol?.exchange, selectedSymbol?.type);
      
      // Auto-save the prediction
      await savePrediction(data);
      await saveLatestPreset();
      // Loader will complete when it's ready
    } catch (error) {
      console.error("Error:", error);
      setShowAdvancedLoader(false);
      setAnalysisReady(false);
      toast.error("An error occurred while getting the analysis");
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketStatus = async (symbol: string, exchange?: string, type?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-market-status', {
        body: { symbol, exchange, type }
      });
      if (!error && data) {
        setMarketStatus(data);
        setMarketTimeZone(data.exchangeTimezoneName);
      }
    } catch (error) {
      console.error('Failed to fetch market status:', error);
    }
  };

  const handleLoaderComplete = () => {
    setShowAdvancedLoader(false);
    setCompletedSteps(prev => [...prev, "analysis"]);
    setCurrentStep("results");
    toast.success("Analysis generated successfully!");
  };

  return (
    <div className="min-h-screen bg-background">
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use previous analysis details?</DialogTitle>
            <DialogDescription>
              We found your recent preferences. Timeframe, investment, and profile can be reused for this analysis.
            </DialogDescription>
          </DialogHeader>

          {latestPreset && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p><strong>Symbol:</strong> {latestPreset.symbol || "-"}</p>
              <p><strong>Timeframe:</strong> {latestPreset.timeframe || "-"}</p>
              <p><strong>Investment:</strong> {latestPreset.investment != null
                ? formatCurrency(Number(latestPreset.investment), 0, false, (latestPreset.profile as { displayCurrency?: "INR" | "USD" })?.displayCurrency ?? "INR")
                : "-"}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPresetDialog(false);
                // User wants fresh settings; continue to Trading Profile with current symbol + amount
                setCompletedSteps(prev => [...prev, "set-investment"]);
                setCurrentStep("trading-profile");
              }}
            >
              Use New
            </Button>
            <Button
              onClick={() => {
                if (latestPreset) {
                  applyPreset(latestPreset, true);
                  setCompletedSteps(prev => [...prev, "choose-asset", "set-investment"]);
                  setCurrentStep("trading-profile");
                  setShowPresetDialog(false);
                  setTimeout(() => {
                    document.getElementById("risk-acknowledge-block")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 300);
                } else {
                  setShowPresetDialog(false);
                }
              }}
            >
              Use Prefilled Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <Container className="py-3 sm:py-4">
          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-center'} mb-4`}>
            <Button
              variant="outline"
              size={isMobile ? "sm" : "sm"}
              onClick={() => navigate('/home')}
              className={`flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
            >
              <Home className="h-4 w-4" />
              Home
            </Button>
            <Button
              variant="outline"
              size={isMobile ? "sm" : "sm"}
              onClick={() => navigate('/predictions')}
              className={`flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
            >
              <History className="h-4 w-4" />
              {isMobile ? "History" : "My Analyses"}
            </Button>
            <Button
              variant="outline"
              size={isMobile ? "sm" : "sm"}
              onClick={() => navigate('/intraday')}
              className={`flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
            >
              <Timer className="h-4 w-4" />
              {isMobile ? "Intraday" : "Intraday Trading"}
            </Button>
            <Button
              variant="outline"
              size={isMobile ? "sm" : "sm"}
              onClick={async () => {
                const { error } = await signOut();
                if (error) {
                  toast.error("Failed to sign out");
                }
              }}
              className={`flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
          
          <div className="text-center space-y-2">
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'} font-bold`}>
              Probability-Based Analysis Software
            </h1>
            <p className={`text-muted-foreground ${isMobile ? 'text-sm' : ''}`}>
              Get real-time AI-powered probability-based analysis for any stock, forex, or crypto
            </p>
            {user?.email && (
              <p className="text-xs text-muted-foreground">
                Welcome back, {user.email}
              </p>
            )}
          </div>

          {/* Progress Stepper */}
          <div className={`${isMobile ? 'mt-4' : 'mt-8'}`}>
            <Stepper 
              steps={steps}
              currentStep={currentStep}
              completedSteps={completedSteps}
              className={isMobile ? 'mobile-stepper' : ''}
            />
          </div>
        </Container>
      </div>

      {/* Main Content */}
      <Container className="py-4 sm:py-8">
        <div className={`grid grid-cols-1 ${!isMobile ? 'lg:grid-cols-12' : ''} gap-4 sm:gap-8`}>
          {/* Left Column - Step Content */}
          <div className={`space-y-6 ${!isMobile ? 'lg:col-span-7 xl:col-span-8' : ''}`}>
            {/* Step 1: Choose Asset */}
            {currentStep === "choose-asset" && (
              <StepContainer 
                title="Choose Your Asset"
                description="Search and select the stock, crypto, or forex pair you want to analyze"
                isActive={true}
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="symbol" className="text-sm font-medium mb-2 block">
                      Symbol
                    </Label>
                    <SymbolSearch
                      value={symbol}
                      onValueChange={setSymbol}
                      onSelectSymbol={setSelectedSymbol}
                      placeholder="Search stocks, crypto, forex... (e.g., AAPL, BTC-USD)"
                    />
                  </div>
                  
                  {symbol && (
                    <div className="space-y-3">
                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span className="font-medium">Selected: {selectedSymbol?.symbol || symbol}</span>
                        </div>
                      </div>

                      {/* Timeframe Selector */}
                      <div>
                        <Label htmlFor="timeframe" className="text-sm font-medium mb-2 block">
                          Analysis Timeframe
                        </Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                          {['15m', '30m', '1h', '4h', '1d', '1w'].map((tf) => (
                            <Button
                              key={tf}
                              variant={timeframe === tf ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setTimeframe(tf);
                                setCustomTimeframe('');
                              }}
                              className="w-full"
                            >
                              {tf}
                            </Button>
                          ))}
                          <Button
                            variant={timeframe === 'custom' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTimeframe('custom')}
                            className="w-full"
                          >
                            Custom
                          </Button>
                        </div>
                        {timeframe === 'custom' && (
                          <div className="mt-2">
                            <Input
                              id="customTimeframe"
                              type="text"
                              placeholder="e.g., 2h, 3d, 2w"
                              value={customTimeframe}
                              onChange={(e) => setCustomTimeframe(e.target.value)}
                              className="w-full"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Format: 15m, 30m, 1h, 2h, 4h, 1d, 2d, 1w, etc.
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {timeframe === '15m' && '⚡ Ultra short-term: AI will analyze next 15 minutes'}
                          {timeframe === '30m' && '⏰ Very short-term: AI will analyze next 30 minutes'}
                          {timeframe === '1h' && '🕐 Short-term: AI will analyze next 1 hour (recommended)'}
                          {timeframe === '4h' && '🕓 Medium-term: AI will analyze next 4 hours'}
                          {timeframe === '1d' && '📅 Daily: AI will analyze today\'s movement'}
                          {timeframe === '1w' && '📆 Weekly: AI will analyze this week\'s movement'}
                          {timeframe === 'custom' && '✏️ Custom timeframe: Enter your desired analysis window'}
                        </p>
                      </div>
                      
                      {selectedSymbol && (
                        <MarketStatus
                          symbol={selectedSymbol.full_symbol}
                          displaySymbol={selectedSymbol.symbol}
                          exchange={selectedSymbol.exchange}
                          type={selectedSymbol.type}
                        />
                      )}
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleNextStep}
                    disabled={!symbol}
                    className="w-full"
                    size="lg"
                  >
                    Continue to Investment Amount
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </StepContainer>
            )}

            {/* Step 2: Set Investment */}
            {currentStep === "set-investment" && (
              <StepContainer 
                title="Set Investment Amount"
                description="Enter the amount you want to invest for position sizing calculations"
                isActive={true}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm text-muted-foreground">Show amounts in</Label>
                    <div className="flex rounded-full border p-0.5 bg-muted/60">
                      <button
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm ${displayCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setDisplayCurrency("INR")}
                      >
                        INR
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm ${displayCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setDisplayCurrency("USD")}
                      >
                        USD
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="investment" className="text-sm font-medium mb-2 block">
                      Investment Amount ({displayCurrency})
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 h-4 w-4 flex items-center justify-center text-muted-foreground font-medium">
                        {displayCurrency === "INR" ? "₹" : "$"}
                      </span>
                      <Input
                        id="investment"
                        type="number"
                        placeholder="1000"
                        value={investment}
                        onChange={(e) => setInvestment(e.target.value)}
                        className="pl-10"
                        min="1"
                        step="0.01"
                      />
                    </div>
                  </div>
                  
                  {investment && (
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Investment: {formatCurrency(parseFloat(investment), 0, false, displayCurrency)}</span>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleNextStep}
                    disabled={!investment || parseFloat(investment) <= 0}
                    className="w-full"
                    size="lg"
                  >
                    Continue to Trading Profile
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </StepContainer>
            )}

            {/* Step 3: Trading Profile */}
            {currentStep === "trading-profile" && (
              <StepContainer 
                title="Your Trading Profile"
                description="Tell us about your trading style and risk preferences for personalized AI analysis"
                isActive={true}
              >
                <div className="space-y-6">
                  <UserProfileForm 
                    profile={userProfile}
                    onChange={setUserProfile}
                    investmentAmount={parseFloat(investment || "0")}
                    marketClosed={marketClosed}
                    marketOpenTime={marketStatus?.nextRegularOpen ? new Date(marketStatus.nextRegularOpen).toLocaleString() : undefined}
                  />
                  
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5" />
                      AI Personalization
                    </h4>
                    <p className="text-sm text-muted-foreground">
AI will use your trading profile to provide tailored probability-based analysis,
                      risk assessments, and recommendations that match your strategy and goals.
                    </p>
                  </div>
                  
                  <Button 
                    onClick={handleNextStep}
                    className="w-full"
                    size="lg"
                    disabled={!userProfile.riskAcceptance}
                  >
                    Continue to Review
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  {!userProfile.riskAcceptance && (
                    <p className="text-sm text-center text-yellow-600 mt-2">
                      ⚠️ You must accept the risk disclosure to continue
                    </p>
                  )}
                </div>
              </StepContainer>
            )}

            {/* Step 4: Review & Start */}
            {currentStep === "review" && (
              <StepContainer 
                title="Review & Start Analysis"
                description="Confirm your analysis parameters before starting the AI analysis"
                isActive={true}
              >
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Asset</p>
                      <p className="text-lg font-semibold">{selectedSymbol?.symbol || symbol}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Investment</p>
                      <p className="text-lg font-semibold">{formatCurrency(parseFloat(investment || "0"), 0, false, displayCurrency)}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg border">
                    <h4 className="font-medium mb-3">Trading Profile Summary</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Risk Tolerance:</span>
                        <span className="ml-2 font-medium capitalize">{userProfile.riskTolerance}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Trading Style:</span>
                        <span className="ml-2 font-medium capitalize">{userProfile.tradingStyle?.replace(/_/g, ' ')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Goal:</span>
                        <span className="ml-2 font-medium capitalize">{userProfile.investmentGoal}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Account Type:</span>
                        <span className="ml-2 font-medium capitalize">{userProfile.marginType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stop Loss:</span>
                        <span className="ml-2 font-medium">{userProfile.stopLossPercentage}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target Profit:</span>
                        <span className="ml-2 font-medium">{userProfile.targetProfitPercentage}%</span>
                      </div>
                      {userProfile.marginType !== 'cash' && (
                        <div>
                          <span className="text-muted-foreground">Leverage:</span>
                          <span className="ml-2 font-medium text-orange-500">{userProfile.leverage}x</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {selectedSymbol && (
                    <MarketStatus
                      symbol={selectedSymbol.full_symbol}
                      displaySymbol={selectedSymbol.symbol}
                      exchange={selectedSymbol.exchange}
                      type={selectedSymbol.type}
                    />
                  )}
                  
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5" />
                      AI Analysis
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Multi-horizon forecasts personalized to your profile</li>
                      <li>• Deep AI reasoning with advanced market analysis</li>
                      <li>• Risk-adjusted recommendations based on your tolerance</li>
                      <li>• Support & resistance levels with confidence scores</li>
                      <li>• Tailored entry/exit strategies for your trading style</li>
                    </ul>
                  </div>
                  
                  <Button 
                    onClick={handleNextStep}
                    disabled={loading}
                    className="w-full"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting Analysis...
                      </>
                    ) : (
                      <>
                        Start AI Analysis
                        <BrainCircuit className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </StepContainer>
            )}

            {/* Step 5: Live Analysis */}
            {currentStep === "analysis" && (
              <StepContainer 
                title="Live AI Analysis"
                description="Our AI is analyzing market data and generating your probability-based analysis"
                isActive={true}
              >
                {showAdvancedLoader && (
                  <AdvancedPredictLoader
                    onComplete={handleLoaderComplete}
                    ready={analysisReady}
                    symbol={symbol}
                    isVisible={showAdvancedLoader}
                    timeframe={timeframe}
                  />
                )}
              </StepContainer>
            )}

            {/* Step 6: Results */}
            {currentStep === "results" && result && (
              <div className="space-y-6">
                
                {/* AI Reasoning - Why this signal? (MOVED TO TOP) */}
                {result.geminiForecast && (
                  <AIReasoningDisplay
                    symbol={result.symbol}
                    action={result.geminiForecast.action_signal?.action || 'HOLD'}
                    confidence={result.geminiForecast.action_signal?.confidence || result.confidence || 50}
                    technicalFactors={result.patterns}
                    keyDrivers={result.geminiForecast.forecasts?.[0]?.key_drivers}
                    oneLineSummary={result.rationale}
                    deepAnalysis={result.geminiForecast.deep_analysis}
                    marketContext={result.geminiForecast.market_context}
                  />
                )}

                {/* Decision Screen - Primary Call to Action */}
                {result.geminiForecast && (
                  <DecisionScreen
                    symbol={result.symbol}
                    currentPrice={result.currentPrice}
                    investment={parseFloat(investment)}
                    action={result.geminiForecast.action_signal?.action || 'HOLD'}
                    confidence={result.geminiForecast.action_signal?.confidence || result.confidence || 50}
                    riskLevel={result.geminiForecast.risk_grade || 'MEDIUM'}
                    expectedROI={{
                      best: result.geminiForecast.expected_roi?.best_case || 10,
                      likely: result.geminiForecast.expected_roi?.likely_case || 5,
                      worst: result.geminiForecast.expected_roi?.worst_case || -5
                    }}
                    positionSize={{
                      shares: result.positionSize?.shares || 0,
                      costPerShare: result.positionSize?.costPerShare || result.currentPrice,
                      totalCost: result.positionSize?.totalCost || 0
                    }}
                    recommendedHoldPeriod={result.geminiForecast.positioning_guidance?.recommended_hold_period}
                    stopLoss={userProfile.stopLossPercentage || 5}
                    takeProfit={userProfile.targetProfitPercentage || 15}
                    leverage={userProfile.leverage || 1}
                    currency={displayCurrency}
                  />
                )}

                {/* START TRACKING BUTTON - Primary CTA */}
                <Card className="border-2 border-primary bg-gradient-to-br from-primary/5 to-background">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="text-center space-y-2">
                        <h3 className="text-2xl font-bold">Ready to Track This Trade?</h3>
                        <p className="text-muted-foreground">
                          Start monitoring this position in real-time with AI-powered tracking
                        </p>
                      </div>
                      
                      {/* Context-aware label for the action buttons */}
                      {result.geminiForecast?.action_signal?.action === 'HOLD' ? (
                        <Alert className="border-yellow-500/50 bg-yellow-500/10">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <AlertDescription className="text-sm">
                            <span className="font-semibold">⚠️ AI recommends HOLD.</span>{" "}
                            Conditions are unclear. You can still place a <strong>real order</strong> (all AI &amp; backtest gates apply) or use <strong>Paper Trade</strong> to simulate risk-free with no money at stake.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="text-xs text-center text-muted-foreground px-2">
                          <strong>Real Order</strong>: real money, all AI gates &amp; backtest must pass.{" "}
                          <strong>Paper Trade</strong>: simulated, no money, gates bypassed.
                        </div>
                      )}

                      {/* Real trade button */}
                      <Button 
                        onClick={async () => {
                          setIsPaperTrade(false);
                          const { tradeTrackingService } = await import("@/services/tradeTrackingService");
                          const last = await tradeTrackingService.getLastUsedStrategy();
                          if (last) {
                            const label = STRATEGIES.find(s => s.value === last.strategyType)?.label ?? last.strategyType;
                            setLastUsedStrategy({ ...last, label });
                            setShowPreviousOrNewDialog(true);
                          } else {
                            setShowStrategyDialog(true);
                          }
                        }}
                        className={`w-full text-lg py-6 shadow-lg ${
                          result.geminiForecast?.action_signal?.action === 'HOLD' 
                            ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600' 
                            : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600'
                        }`}
                        size="lg"
                      >
                        <Timer className="mr-2 h-5 w-5" />
                        {result.geminiForecast?.action_signal?.action === 'HOLD' 
                          ? '💰 Place Real Order Anyway (Real Money)' 
                          : '🎯 Place Real Order & Track Trade'
                        }
                      </Button>

                      {/* Paper Trade button */}
                      <Button
                        variant="outline"
                        onClick={async () => {
                          setIsPaperTrade(true);
                          const { tradeTrackingService } = await import("@/services/tradeTrackingService");
                          const last = await tradeTrackingService.getLastUsedStrategy();
                          if (last) {
                            const label = STRATEGIES.find(s => s.value === last.strategyType)?.label ?? last.strategyType;
                            setLastUsedStrategy({ ...last, label });
                            setShowPreviousOrNewDialog(true);
                          } else {
                            setShowStrategyDialog(true);
                          }
                        }}
                        className="w-full text-base py-5 border-2 border-violet-500/50 text-violet-700 hover:bg-violet-500/10 hover:border-violet-500"
                        size="lg"
                      >
                        <FlaskConical className="mr-2 h-5 w-5" />
                        🧪 Paper Trade — Simulate (No Real Money)
                      </Button>

                      {/* Use previous strategy or choose new */}
                      {result && lastUsedStrategy && (
                        <UsePreviousOrNewStrategyDialog
                          open={showPreviousOrNewDialog}
                          onOpenChange={setShowPreviousOrNewDialog}
                          lastStrategyLabel={lastUsedStrategy.label}
                          symbol={result.symbol}
                          action={result.geminiForecast?.action_signal?.action === 'SELL' ? 'SELL' : 'BUY'}
                          onUsePrevious={() => {
                            // Route through StrategySelectionDialog for backtest + strategy achievement validation,
                            // pre-selecting the previously used strategy so validation runs automatically.
                            setShowStrategyDialog(true);
                          }}
                          onChooseNew={() => setShowStrategyDialog(true)}
                        />
                      )}

                      {/* Strategy selection (AI + market research) → place order */}
                      {result && (
                        <StrategySelectionDialog
                          open={showStrategyDialog}
                          onOpenChange={setShowStrategyDialog}
                          currentStrategy={lastUsedStrategy?.strategyType ?? userProfile.tradingStrategy ?? 'trend_following'}
                          symbol={result.symbol}
                          action={result.geminiForecast?.action_signal?.action === 'SELL' ? 'SELL' : 'BUY'}
                          investment={investment ? parseFloat(investment) : 10000}
                          timeframe={timeframe === "custom" ? customTimeframe || "1d" : timeframe || "1d"}
                          isPaperTrade={isPaperTrade}
                          onConfirm={placeMockOrderAndTrack}
                        />
                      )}

                      <TradingIntegrationModal
                        open={showIntegrationModal}
                        onOpenChange={setShowIntegrationModal}
                        onSaved={async () => {
                          await refreshTradingIntegration();
                          setShowIntegrationModal(false);
                          setShowStrategyDialog(true);
                        }}
                        onSkip={() => setShowIntegrationModal(false)}
                        save={async (params) => saveTradingIntegration(params)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Capital Scenarios - Small vs Large investors */}
                {result.geminiForecast?.expected_roi && (
                  <CapitalScenarios
                    currentPrice={result.currentPrice}
                    expectedROI={{
                      best:   result.geminiForecast.expected_roi.best_case   || 0.5,
                      likely: result.geminiForecast.expected_roi.likely_case || 0.2,
                      worst:  result.geminiForecast.expected_roi.worst_case  || -2.0
                    }}
                    stopLossPercentage={userProfile.stopLossPercentage || 5}
                    leverage={userProfile.leverage}
                    allowFractionalShares={true} // Modern brokers support fractional shares (Robinhood, Webull, etc.)
                  />
                )}

                {/* Leverage Simulator */}
                {(userProfile.leverage && userProfile.leverage > 1) || userProfile.marginType !== 'cash' ? (
                  <LeverageSimulator
                    investment={parseFloat(investment)}
                    expectedMove={result.geminiForecast?.forecasts?.[0]?.expected_return_bp ? 
                      result.geminiForecast.forecasts[0].expected_return_bp / 100 : 5}
                    currentLeverage={userProfile.leverage || 1}
                  />
                ) : null}

                {/* Market Conditions Dashboard */}
                <MarketConditionsDashboard />

                {/* Multi-Horizon Forecasts */}
                {result.geminiForecast?.forecasts && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Multi-Horizon Forecasts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ForecastTable 
                        forecasts={result.geminiForecast.forecasts} 
                        predictedAt={predictedAt}
                        marketTimeZone={marketTimeZone}
                        marketStatus={marketStatus}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Key Levels */}
                {result.geminiForecast?.support_resistance && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Key Price Levels</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <KeyLevels
                        supportLevels={result.geminiForecast.support_resistance.supports}
                        resistanceLevels={result.geminiForecast.support_resistance.resistances}
                        currentPrice={result.currentPrice}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* AI Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle>AI Insights & Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Insights
                      keyDrivers={result.geminiForecast?.forecasts?.[0]?.key_drivers}
                      riskFlags={result.geminiForecast?.forecasts?.[0]?.risk_flags}
                      opportunities={result.opportunities}
                      rationale={result.rationale}
                      patterns={result.patterns}
                    />
                  </CardContent>
                </Card>

                {/* News & AI Sentiment */}
                <NewsAnalysis 
                  symbol={result.symbol} 
                  predictedAt={predictedAt} 
                />

                {/* Pipeline Timeline */}
                {result.meta?.pipeline && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Analysis Timeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PredictionTimeline
                        pipeline={result.meta.pipeline}
                        forecasts={result.geminiForecast?.forecasts?.map(f => ({
                          horizon: f.horizon,
                          direction: f.direction,
                          probabilities: f.probabilities,
                          expected_return_bp: f.expected_return_bp,
                          confidence: f.confidence
                        })) || []}
                        predictedAt={predictedAt || new Date()}
                        marketTimeZone={marketTimeZone}
                        marketStatus={marketStatus}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Regulatory Disclaimer */}
                <RegulatoryDisclaimer />

                {/* Action Buttons */}
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      onClick={startNewPredictionFlow}
                      variant="outline"
                    >
                      New Analysis
                    </Button>
                    <Button 
                      onClick={() => navigate('/predictions')}
                      variant="outline"
                    >
                      View All Analyses
                    </Button>
                  </div>

                  <Button 
                    onClick={() => navigate('/active-trades')}
                    variant="secondary"
                    className="w-full"
                  >
                    View Active Trades
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Live Chart */}
          {!isMobile && (
            <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-8 space-y-6">
            <Card>
              <CardHeader className={`${isMobile ? 'pb-2' : 'pb-4'}`}>
                <div className="flex items-center justify-between">
                  <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'}`}>Live Chart</CardTitle>
                  {symbol && (
                    <Badge variant="outline" className="text-xs">
                      {symbol}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className={`${isMobile ? 'h-[300px]' : 'h-[600px]'}`}>
                  <ChartPanel
                    syncSymbol={symbol ? getTradingViewSymbol(selectedSymbol?.full_symbol || symbol) : undefined}
                    defaultSymbol="NASDAQ:AAPL"
                    defaultInterval="D"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Chart Analysis */}
            {chartAnalysis && (
              <Card className={`${isMobile ? 'mt-4' : 'mt-6'}`}>
                <CardHeader className={isMobile ? 'pb-2' : ''}>
                  <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'}`}>Chart Analysis</CardTitle>
                </CardHeader>
                <CardContent className={isMobile ? 'pt-2' : ''}>
                  <div className="space-y-3">
                    <p className={`leading-relaxed ${isMobile ? 'text-sm' : 'text-sm'}`}>{chartAnalysis}</p>
                    {chartDataSource && (
                      <p className="text-xs text-muted-foreground">
                        Data source: {chartDataSource}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
          )}
        </div>
      </Container>

      {/* Disclaimer */}
      <div className="border-t bg-muted/20">
        <Container className="py-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className={`${isMobile ? 'text-xs' : 'text-sm'}`}>
              This is AI-generated probability-based analysis for educational purposes only. Not financial advice.
              Past performance does not guarantee future results. Always do your own research.
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    </div>
  );
};

export default PredictPage;