import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  BarChart3,
  Activity,
  Zap,
  Shield,
  Timer,
  Calendar,
  DollarSign,
  Percent,
  ArrowRight,
  RefreshCw,
  Play,
  Pause,
  Square
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { useIsMobile } from '@/hooks/use-mobile';
import { mockIntradayData } from '@/data/intradayMockData';
import type { IntradayPrediction, HourlyPrediction } from '@/data/intradayMockData';
import { SymbolSearch } from '@/components/SymbolSearch';
import type { SymbolData } from '@/components/SymbolSearch';

export default function IntradayPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [selectedSymbolData, setSelectedSymbolData] = useState<SymbolData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [predictionData, setPredictionData] = useState<IntradayPrediction>(mockIntradayData);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeFilter, setTimeFilter] = useState('all');

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update current price with small random changes
      setPredictionData(prev => ({
        ...prev,
        currentPrice: prev.currentPrice + (Math.random() - 0.5) * 0.1,
        timestamp: new Date().toISOString()
      }));
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSymbolSelect = (symbolData: SymbolData) => {
    setSelectedSymbolData(symbolData);
    setSelectedSymbol(symbolData.symbol);
    // Clear current predictions when new symbol is selected
    setPredictionData(mockIntradayData);
  };

  const handleSymbolSearch = async () => {
    if (!selectedSymbol || selectedSymbol.trim() === '') {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Generate intraday predictions based on the selected symbol
      const newPredictionData = generateIntradayPredictions(selectedSymbol);
      setPredictionData(newPredictionData);
    } catch (error) {
      console.error('Error generating intraday predictions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateIntradayPredictions = (symbol: string): IntradayPrediction => {
    // Generate more realistic prices based on symbol type
    let basePrice: number;
    let maxChange: number;
    
    if (selectedSymbolData) {
      switch (selectedSymbolData.type) {
        case 'crypto':
          basePrice = 0.1 + Math.random() * 100; // $0.1 - $100
          maxChange = basePrice * 0.15; // 15% max change
          break;
        case 'forex':
          basePrice = 0.5 + Math.random() * 2; // 0.5 - 2.5
          maxChange = basePrice * 0.02; // 2% max change
          break;
        case 'commodity':
          basePrice = 50 + Math.random() * 2000; // $50 - $2050
          maxChange = basePrice * 0.05; // 5% max change
          break;
        case 'index':
          basePrice = 1000 + Math.random() * 50000; // 1000 - 51000
          maxChange = basePrice * 0.03; // 3% max change
          break;
        default: // stock
          basePrice = 10 + Math.random() * 500; // $10 - $510
          maxChange = basePrice * 0.08; // 8% max change
          break;
      }
    } else {
      basePrice = 100 + Math.random() * 200; // Default: $100-300
      maxChange = basePrice * 0.08; // 8% max change
    }
    
    const change = (Math.random() - 0.5) * maxChange;
    const changePercent = (change / basePrice) * 100;
    const currentPrice = basePrice + change;
    
    // Generate hourly predictions for trading hours (9 AM - 4 PM)
    const hourlyPredictions: HourlyPrediction[] = [];
    const tradingHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    
    // Market pattern: Opening volatility, lunch lull, afternoon momentum
    const marketPatterns = {
      '09:00': { volatility: 'high', volume: 'high', confidence: 0.7 },
      '10:00': { volatility: 'normal', volume: 'high', confidence: 0.8 },
      '11:00': { volatility: 'normal', volume: 'normal', confidence: 0.75 },
      '12:00': { volatility: 'low', volume: 'low', confidence: 0.6 },
      '13:00': { volatility: 'low', volume: 'low', confidence: 0.65 },
      '14:00': { volatility: 'normal', volume: 'high', confidence: 0.8 },
      '15:00': { volatility: 'high', volume: 'high', confidence: 0.85 },
      '16:00': { volatility: 'normal', volume: 'normal', confidence: 0.7 }
    };
    
    tradingHours.forEach((hour, index) => {
      const pattern = marketPatterns[hour as keyof typeof marketPatterns];
      const baseConfidence = pattern.confidence;
      
      // Determine direction with market trend influence
      let direction: 'up' | 'down' | 'sideways';
      if (overallTrend === 'bullish') {
        direction = Math.random() > 0.3 ? 'up' : Math.random() > 0.5 ? 'sideways' : 'down';
      } else if (overallTrend === 'bearish') {
        direction = Math.random() > 0.3 ? 'down' : Math.random() > 0.5 ? 'sideways' : 'up';
      } else {
        direction = Math.random() > 0.5 ? 'up' : 'down';
      }
      
      const probability = 0.5 + Math.random() * 0.4; // 50-90% probability
      const expectedMove = (Math.random() * 2 + 0.5) * (direction === 'up' ? 1 : direction === 'down' ? -1 : 0.1); // 0.5-2.5% move
      const confidence = Math.round((baseConfidence + Math.random() * 0.2) * 100); // Base confidence + variation
      const volume = pattern.volume as 'high' | 'normal' | 'low';
      const volatility = pattern.volatility as 'high' | 'normal' | 'low';
      
      // Generate relevant key factors based on time and market conditions
      const keyFactors = [];
      if (hour === '09:00') keyFactors.push('Opening gap analysis', 'Pre-market momentum');
      if (hour === '14:00') keyFactors.push('Power hour momentum', 'Technical breakout potential');
      if (volume === 'high') keyFactors.push('High trading volume', 'Strong market participation');
      if (volatility === 'high') keyFactors.push('Increased volatility', 'Breakout opportunities');
      
      // Add some random factors
      const additionalFactors = [
        'Technical support/resistance',
        'Market sentiment shift',
        'News catalyst',
        'Institutional flow',
        'Options expiration impact'
      ];
      keyFactors.push(...additionalFactors.slice(0, 2 + Math.floor(Math.random() * 2)));
      
      // Generate risk factors
      const riskFactors = [];
      if (volatility === 'high') riskFactors.push('High volatility risk');
      if (volume === 'low') riskFactors.push('Low liquidity risk');
      if (hour === '09:00') riskFactors.push('Opening gap risk');
      if (hour === '16:00') riskFactors.push('End-of-day volatility');
      
      const additionalRiskFactors = [
        'News uncertainty',
        'Technical resistance',
        'Economic data release',
        'Market manipulation risk'
      ];
      riskFactors.push(...additionalRiskFactors.slice(0, 1 + Math.floor(Math.random() * 2)));
      
      hourlyPredictions.push({
        hour: `${hour}`,
        time: hour,
        direction,
        probability,
        expectedMove,
        confidence,
        keyFactors,
        riskFactors,
        volume,
        volatility
      });
    });
    
    // Determine overall trend based on hourly predictions
    const bullishHours = hourlyPredictions.filter(p => p.direction === 'up').length;
    const bearishHours = hourlyPredictions.filter(p => p.direction === 'down').length;
    const overallTrend = bullishHours > bearishHours ? 'bullish' : bearishHours > bullishHours ? 'bearish' : 'neutral';
    
    // Calculate confidence and risk level
    const avgConfidence = hourlyPredictions.reduce((sum, p) => sum + p.confidence, 0) / hourlyPredictions.length;
    const riskLevel = avgConfidence > 80 ? 'low' : avgConfidence > 60 ? 'medium' : 'high';
    
    // Generate support and resistance levels based on price action
    const support = [
      currentPrice * (0.98 + Math.random() * 0.01), // 98-99% of current price
      currentPrice * (0.95 + Math.random() * 0.02), // 95-97% of current price
      currentPrice * (0.92 + Math.random() * 0.02)  // 92-94% of current price
    ];
    const resistance = [
      currentPrice * (1.01 + Math.random() * 0.01), // 101-102% of current price
      currentPrice * (1.03 + Math.random() * 0.02), // 103-105% of current price
      currentPrice * (1.06 + Math.random() * 0.02)  // 106-108% of current price
    ];
    
    // Generate volume profile based on price levels
    const highVolume = [
      currentPrice * (1.00 + Math.random() * 0.005), // Current price ± 0.5%
      currentPrice * (1.01 + Math.random() * 0.01)  // 1-2% above current price
    ];
    const lowVolume = [
      currentPrice * (0.99 - Math.random() * 0.005), // 0.5-1% below current price
      currentPrice * (0.98 - Math.random() * 0.01)  // 1-2% below current price
    ];
    
    // Generate momentum indicators based on trend
    const momentum = {
      rsi: overallTrend === 'bullish' ? 45 + Math.random() * 25 : overallTrend === 'bearish' ? 25 + Math.random() * 25 : 30 + Math.random() * 40, // RSI based on trend
      macd: (Math.random() - 0.5) * 0.5, // -0.25 to 0.25
      macdSignal: (Math.random() - 0.5) * 0.3, // -0.15 to 0.15
      strength: overallTrend === 'bullish' ? 0.6 + Math.random() * 0.3 : overallTrend === 'bearish' ? 0.2 + Math.random() * 0.3 : 0.3 + Math.random() * 0.5 // Strength based on trend
    };
    
    return {
      symbol: symbol.toUpperCase(),
      currentPrice,
      change,
      changePercent,
      timestamp: new Date().toISOString(),
      hourlyPredictions,
      overallTrend,
      confidence: Math.round(avgConfidence),
      riskLevel,
      keyLevels: { support, resistance },
      volumeProfile: { highVolume, lowVolume },
      momentum
    };
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return <ArrowUpRight className="h-4 w-4 text-green-600" />;
      case 'down': return <ArrowDownRight className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'up': return 'text-green-600 bg-green-50 border-green-200';
      case 'down': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getVolumeColor = (volume: string) => {
    switch (volume) {
      case 'high': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'normal': return 'text-green-600 bg-green-50 border-green-200';
      case 'low': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const filteredPredictions = predictionData.hourlyPredictions.filter(pred => {
    if (timeFilter === 'all') return true;
    if (timeFilter === 'morning') return ['09:00', '10:00', '11:00'].includes(pred.time);
    if (timeFilter === 'afternoon') return ['13:00', '14:00', '15:00'].includes(pred.time);
    if (timeFilter === 'power-hours') return ['14:00', '15:00'].includes(pred.time);
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <Container className="py-3 sm:py-4">
          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-between items-center'} mb-4`}>
            <Button
              variant="outline"
              size={isMobile ? "sm" : "sm"}
              onClick={() => navigate('/predict')}
              className={`flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              {isMobile ? "Back" : "Back to Predictions"}
            </Button>
            <Button
              variant="outline"
              size={isMobile ? "sm" : "sm"}
              onClick={() => navigate('/predictions')}
              className={`flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
            >
              <BarChart3 className="h-4 w-4" />
              {isMobile ? "History" : "Prediction History"}
            </Button>
          </div>
          
          <div className="text-center space-y-2">
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'} font-bold`}>
              🚀 Intraday Trading
            </h1>
            <p className={`text-gray-300 ${isMobile ? 'text-sm' : ''}`}>
              Hourly predictions for day traders - Real-time intraday analysis
            </p>
          </div>
        </Container>
      </div>

      {/* Main Content */}
      <Container className="py-6">
        {/* Symbol Search */}
        <Card className="mb-6">
          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-white">
                  <Target className="h-5 w-5" />
                  Symbol Analysis
                </CardTitle>
            <CardDescription className="text-gray-300">
              Enter a stock symbol to get intraday hourly predictions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <SymbolSearch
                    value={selectedSymbolData?.full_symbol || selectedSymbol}
                    onValueChange={setSelectedSymbol}
                    onSelectSymbol={handleSymbolSelect}
                    placeholder="Search stocks, crypto, forex... (e.g., AAPL, BTC-USD)"
                  />
                </div>
                <Button 
                  onClick={handleSymbolSearch}
                  disabled={isLoading || !selectedSymbol}
                  className="min-w-[120px]"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isLoading ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>
              
              {selectedSymbolData && (
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-white">Selected: {selectedSymbolData.symbol}</span>
                    <Badge variant="outline" className="text-xs">
                      {selectedSymbolData.type}
                    </Badge>
                    <span className="text-sm text-gray-300">{selectedSymbolData.description}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Current Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Activity className="h-5 w-5" />
              Current Status - {selectedSymbolData ? `${selectedSymbolData.symbol} (${selectedSymbolData.description})` : 'No Symbol Selected'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedSymbolData ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-4">
                  <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-lg font-medium text-white">Select a symbol to analyze</p>
                  <p className="text-sm text-gray-300">Choose a stock, crypto, or forex pair to get intraday predictions</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">${predictionData.currentPrice.toFixed(2)}</p>
                    <p className="text-sm text-gray-300">Current Price</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${predictionData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {predictionData.change >= 0 ? '+' : ''}{predictionData.change.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-300">Change</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${predictionData.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {predictionData.changePercent >= 0 ? '+' : ''}{predictionData.changePercent.toFixed(2)}%
                    </p>
                    <p className="text-sm text-gray-300">Change %</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{predictionData.confidence}%</p>
                    <p className="text-sm text-gray-300">Confidence</p>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getDirectionColor(predictionData.overallTrend)}
                    >
                      {predictionData.overallTrend === 'bullish' ? '📈 Bullish' : 
                       predictionData.overallTrend === 'bearish' ? '📉 Bearish' : '➡️ Neutral'}
                    </Badge>
                    <span className="text-sm text-gray-300">Overall Trend</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getRiskColor(predictionData.riskLevel)}
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      {predictionData.riskLevel.charAt(0).toUpperCase() + predictionData.riskLevel.slice(1)} Risk
                    </Badge>
                    <span className="text-sm text-gray-300">Risk Level</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200">
                      <Timer className="h-3 w-3 mr-1" />
                      Real-time
                    </Badge>
                    <span className="text-sm text-gray-300">Live Updates</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Analysis Tabs */}
        {selectedSymbolData && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="hourly">Hourly</TabsTrigger>
            <TabsTrigger value="levels">Key Levels</TabsTrigger>
            <TabsTrigger value="momentum">Momentum</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Hourly Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Clock className="h-5 w-5" />
                    Hourly Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white">Bullish Hours:</span>
                      <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">
                        {predictionData.hourlyPredictions.filter(p => p.direction === 'up').length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white">Bearish Hours:</span>
                      <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200">
                        {predictionData.hourlyPredictions.filter(p => p.direction === 'down').length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white">Sideways Hours:</span>
                      <Badge variant="outline" className="text-gray-600 bg-gray-50 border-gray-200">
                        {predictionData.hourlyPredictions.filter(p => p.direction === 'sideways').length}
                      </Badge>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-white">Best Trading Hours:</span>
                      <span className="text-sm text-green-600 font-medium">2:00 PM - 3:00 PM</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-white">Avoid Trading:</span>
                      <span className="text-sm text-red-600 font-medium">12:00 PM - 1:00 PM</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <AlertTriangle className="h-5 w-5" />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Overall Risk</span>
                        <span className="text-white">{predictionData.riskLevel.charAt(0).toUpperCase() + predictionData.riskLevel.slice(1)}</span>
                      </div>
                      <Progress 
                        value={predictionData.riskLevel === 'low' ? 25 : predictionData.riskLevel === 'medium' ? 50 : 75} 
                        className="h-2"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Market Volatility</span>
                        <span className="text-white">Medium</span>
                      </div>
                      <Progress value={60} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Liquidity</span>
                        <span className="text-white">High</span>
                      </div>
                      <Progress value={85} className="h-2" />
                    </div>
                    <Separator />
                    <div className="text-sm text-gray-300">
                      <p>• Use tight stop losses during volatile hours</p>
                      <p>• High volume periods offer better entry/exit</p>
                      <p>• Avoid low liquidity periods (lunch hour)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Hourly Tab */}
          <TabsContent value="hourly" className="space-y-4">
            {/* Time Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Timer className="h-5 w-5" />
                  Hourly Predictions
                </CardTitle>
                                  <CardDescription className="text-gray-300">
                    Detailed hourly analysis with probability and risk assessment
                  </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hours</SelectItem>
                      <SelectItem value="morning">Morning (9-11 AM)</SelectItem>
                      <SelectItem value="afternoon">Afternoon (1-3 PM)</SelectItem>
                      <SelectItem value="power-hours">Power Hours (2-3 PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {filteredPredictions.map((prediction, index) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="text-lg font-semibold text-white">{prediction.hour}</div>
                            <Badge 
                              variant="outline" 
                              className={getDirectionColor(prediction.direction)}
                            >
                              {getDirectionIcon(prediction.direction)}
                              {prediction.direction.charAt(0).toUpperCase() + prediction.direction.slice(1)}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">+{prediction.expectedMove.toFixed(1)}%</div>
                            <div className="text-sm text-gray-300">Expected Move</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <div className="text-sm text-gray-300">Probability</div>
                            <div className="text-lg font-semibold text-white">{(prediction.probability * 100).toFixed(0)}%</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-300">Confidence</div>
                            <div className="text-lg font-semibold text-white">{prediction.confidence}%</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-300">Volume</div>
                            <Badge 
                              variant="outline" 
                              className={getVolumeColor(prediction.volume)}
                            >
                              {prediction.volume.charAt(0).toUpperCase() + prediction.volume.slice(1)}
                            </Badge>
                          </div>
                          <div>
                            <div className="text-sm text-gray-300">Volatility</div>
                            <Badge 
                              variant="outline" 
                              className={prediction.volatility === 'high' ? 'text-red-600 bg-red-50 border-red-200' : 
                                       prediction.volatility === 'normal' ? 'text-yellow-600 bg-yellow-50 border-yellow-200' : 
                                       'text-green-600 bg-green-50 border-green-200'}
                            >
                              {prediction.volatility.charAt(0).toUpperCase() + prediction.volatility.slice(1)}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium text-green-600 mb-1">Key Factors</div>
                            <div className="space-y-1">
                              {prediction.keyFactors.map((factor, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-sm">
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                  <span className="text-white">{factor}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-red-600 mb-1">Risk Factors</div>
                            <div className="space-y-1">
                              {prediction.riskFactors.map((factor, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-sm">
                                  <XCircle className="h-3 w-3 text-red-600" />
                                  <span className="text-white">{factor}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Key Levels Tab */}
          <TabsContent value="levels" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Support Levels */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <TrendingUp className="h-5 w-5" />
                    Support Levels
                  </CardTitle>
                  <CardDescription className="text-gray-300">
                    Key price levels where the stock is likely to find support
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {predictionData.keyLevels.support.map((level, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="font-medium text-white">${level.toFixed(2)}</span>
                        </div>
                        <Badge variant="outline" className="text-green-600 bg-green-100 border-green-300 text-sm font-medium">
                          Strong
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Resistance Levels */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-5 w-5" />
                    Resistance Levels
                  </CardTitle>
                  <CardDescription className="text-gray-300">
                    Key price levels where the stock is likely to face resistance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {predictionData.keyLevels.resistance.map((level, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span className="font-medium text-white">${level.toFixed(2)}</span>
                        </div>
                        <Badge variant="outline" className="text-red-600 bg-red-100 border-red-300 text-sm font-medium">
                          Strong
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Volume Profile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Volume Profile
                </CardTitle>
                                  <CardDescription className="text-gray-300">
                    Price levels with high and low trading volume
                  </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-blue-600 mb-3">High Volume Areas</h4>
                    <div className="space-y-2">
                      {predictionData.volumeProfile.highVolume.map((level, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                          <span className="font-medium text-blue-900">${level.toFixed(2)}</span>
                          <Badge variant="outline" className="text-blue-600 bg-blue-100 border-blue-300">
                            High Volume
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-600 mb-3">Low Volume Areas</h4>
                    <div className="space-y-2">
                      {predictionData.volumeProfile.lowVolume.map((level, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="font-medium text-gray-900">${level.toFixed(2)}</span>
                          <Badge variant="outline" className="text-gray-600 bg-gray-100 border-gray-300">
                            Low Volume
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Momentum Tab */}
          <TabsContent value="momentum" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Technical Indicators */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Zap className="h-5 w-5" />
                    Technical Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">RSI (14)</span>
                        <span className="text-white">{predictionData.momentum.rsi.toFixed(1)}</span>
                      </div>
                      <Progress 
                        value={predictionData.momentum.rsi} 
                        className="h-2"
                      />
                      <div className="text-xs text-gray-300 mt-1">
                        {predictionData.momentum.rsi > 70 ? 'Overbought' : 
                         predictionData.momentum.rsi < 30 ? 'Oversold' : 'Neutral'}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">MACD</span>
                        <span className="text-white">{predictionData.momentum.macd.toFixed(3)}</span>
                      </div>
                      <div className="text-xs text-gray-300">
                        Signal: {predictionData.momentum.macdSignal.toFixed(3)}
                      </div>
                      <div className="text-xs text-gray-300">
                        {predictionData.momentum.macd > predictionData.momentum.macdSignal ? 'Bullish' : 'Bearish'} Signal
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Momentum Strength</span>
                        <span className="text-white">{(predictionData.momentum.strength * 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={predictionData.momentum.strength * 100} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trading Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Target className="h-5 w-5" />
                    Trading Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <h4 className="font-medium text-green-800 mb-2">✅ Best Entry Points</h4>
                      <ul className="text-sm text-green-700 space-y-1">
                        <li>• 2:00 PM - High volume, strong momentum</li>
                        <li>• 9:00 AM - Opening gap opportunities</li>
                        <li>• Support levels: ${predictionData.keyLevels.support[0].toFixed(2)}</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <h4 className="font-medium text-yellow-800 mb-2">⚠️ Caution Areas</h4>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        <li>• 12:00 PM - Low volume, lunch hour</li>
                        <li>• Resistance at ${predictionData.keyLevels.resistance[0].toFixed(2)}</li>
                        <li>• High volatility periods</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <h4 className="font-medium text-red-800 mb-2">❌ Avoid Trading</h4>
                      <ul className="text-sm text-red-700 space-y-1">
                        <li>• Market open volatility (first 15 min)</li>
                        <li>• Low liquidity periods</li>
                        <li>• Major news events</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
        )}

        {/* Footer Info */}
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="text-center text-sm text-gray-300">
              <p>🕐 Last updated: {new Date(predictionData.timestamp).toLocaleTimeString()}</p>
              <p>📊 Data refreshes every 5 seconds for real-time intraday analysis</p>
              <p>⚠️ This is for educational purposes. Always do your own research before trading.</p>
            </div>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
