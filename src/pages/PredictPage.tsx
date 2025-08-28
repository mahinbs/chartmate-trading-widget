import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ChartPanel from "@/components/ChartPanel";
import { AdvancedPredictLoader } from "@/components/AdvancedPredictLoader";
import { PredictionTimeline } from "@/components/PredictionTimeline";
import { Stepper } from "@/components/ui/stepper";
import { StepContainer } from "@/components/ui/step-container";
import { SummaryHeader } from "@/components/prediction/SummaryHeader";
import { ForecastTable } from "@/components/prediction/ForecastTable";
import { KeyLevels } from "@/components/prediction/KeyLevels";
import { Insights } from "@/components/prediction/Insights";
import { MarketStatus } from "@/components/market/MarketStatus";
import { supabase } from "@/integrations/supabase/client";
import type { SymbolData } from "@/components/SymbolSearch";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, AlertTriangle, BrainCircuit, BarChart3, CheckCircle, ArrowRight, DollarSign, LogOut, History } from "lucide-react";

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
}

const PredictPage = () => {
  const [symbol, setSymbol] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolData | null>(null);
  const [investment, setInvestment] = useState("");
  const [chartInterval, setChartInterval] = useState("15");
  const timeframe = "1h"; // Default to 1 hour for better prediction accuracy
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
  const [predictedAt, setPredictedAt] = useState<Date | null>(null);
  
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const steps = [
    { id: "choose-asset", title: "Choose Asset", description: "Select symbol" },
    { id: "set-investment", title: "Set Investment", description: "Amount to invest" },
    { id: "review", title: "Review & Start", description: "Confirm details" },
    { id: "analysis", title: "Live Analysis", description: "AI processing" },
    { id: "results", title: "Results", description: "View prediction" }
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
      setCompletedSteps(prev => [...prev, "choose-asset"]);
      setCurrentStep("set-investment");
    } else if (currentStep === "set-investment" && investment) {
      setCompletedSteps(prev => [...prev, "set-investment"]);
      setCurrentStep("review");
    } else if (currentStep === "review") {
      setCompletedSteps(prev => [...prev, "review"]);
      setCurrentStep("analysis");
      handlePredict();
    }
  };

  const handlePredict = async () => {
    if (!symbol || !investment) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    setShowAdvancedLoader(true);
    setAnalysisReady(false);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('predict-movement', {
        body: {
          symbol: symbol.split(':')[1] || symbol,
          investment: parseFloat(investment),
          timeframe,
          horizons: [60, 240, 1440, 10080] // Request multiple horizons: 1h, 4h, 1d, 1w
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
      // Auto-save the prediction
      await savePrediction(data);
      // Loader will complete when it's ready
    } catch (error) {
      console.error("Error:", error);
      setShowAdvancedLoader(false);
      setAnalysisReady(false);
      toast.error("An error occurred while getting the prediction");
    } finally {
      setLoading(false);
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
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/predictions')}
              className="flex items-center gap-2"
            >
              <History className="h-4 w-4" />
              My Predictions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { error } = await signOut();
                if (error) {
                  toast.error("Failed to sign out");
                }
              }}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
          
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold">
              AI Market Prediction
            </h1>
            <p className="text-muted-foreground">
              Get real-time AI-powered predictions for any stock, forex, or crypto
            </p>
            {user?.email && (
              <p className="text-sm text-muted-foreground">
                Welcome back, {user.email}
              </p>
            )}
          </div>

          {/* Progress Stepper */}
          <div className="mt-8">
            <Stepper 
              steps={steps}
              currentStep={currentStep}
              completedSteps={completedSteps}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Left Column - Step Content */}
          <div className="space-y-6">
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
                  <div>
                    <Label htmlFor="investment" className="text-sm font-medium mb-2 block">
                      Investment Amount (USD)
                    </Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                        <span className="font-medium">Investment: ${parseFloat(investment).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleNextStep}
                    disabled={!investment || parseFloat(investment) <= 0}
                    className="w-full"
                    size="lg"
                  >
                    Continue to Review
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </StepContainer>
            )}

            {/* Step 3: Review & Start */}
            {currentStep === "review" && (
              <StepContainer 
                title="Review & Start Analysis"
                description="Confirm your prediction parameters before starting the AI analysis"
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
                      <p className="text-lg font-semibold">${parseFloat(investment || "0").toLocaleString()}</p>
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
                    <h4 className="font-medium mb-2">Analysis Details</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Multi-horizon forecasts (1h, 4h, 1d, 1w)</li>
                      <li>• AI-powered market sentiment analysis</li>
                      <li>• Support & resistance level identification</li>
                      <li>• Risk assessment and key drivers</li>
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

            {/* Step 4: Live Analysis */}
            {currentStep === "analysis" && (
              <StepContainer 
                title="Live AI Analysis"
                description="Our AI is analyzing market data and generating your prediction"
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

            {/* Step 5: Results */}
            {currentStep === "results" && result && (
              <div className="space-y-6">
                <StepContainer 
                  title="Analysis Complete"
                  description="Your AI-powered market prediction is ready"
                  isActive={true}
                >
                  <SummaryHeader
                    symbol={result.symbol}
                    currentPrice={result.currentPrice}
                    change={result.change}
                    changePercent={result.changePercent}
                    recommendation={result.recommendation}
                    confidence={result.confidence}
                  />
                </StepContainer>

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
                      <ForecastTable forecasts={result.geminiForecast.forecasts} />
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
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <Button 
                    onClick={() => {
                      setCurrentStep("choose-asset");
                      setCompletedSteps([]);
                      setResult(null);
                      setSymbol("");
                      setInvestment("");
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    New Prediction
                  </Button>
                  <Button 
                    onClick={() => navigate('/predictions')}
                    className="flex-1"
                  >
                    View All Predictions
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Live Chart */}
          <div className="lg:sticky lg:top-8 lg:h-fit">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Live Chart</CardTitle>
                  {symbol && (
                    <Badge variant="outline" className="text-xs">
                      {symbol}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[600px]">
                  <ChartPanel />
                </div>
              </CardContent>
            </Card>

            {/* Chart Analysis */}
            {chartAnalysis && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Chart Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-sm leading-relaxed">{chartAnalysis}</p>
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
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border-t bg-muted/30">
        <div className="container mx-auto px-6 py-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              This is an AI-generated prediction for educational purposes only. Not financial advice.
              Past performance does not guarantee future results. Always do your own research.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
};

export default PredictPage;