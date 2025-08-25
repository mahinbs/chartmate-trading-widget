import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from '@/integrations/supabase/client';
import { Search } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { usePredictions } from '@/hooks/usePredictions';

const PredictPage = () => {
  const { user, signOut } = useAuth();
  const { savePrediction } = usePredictions();
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState<string>(searchParams.get('symbol') || '');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<any>(null);
  const [timeframe, setTimeframe] = useState<string>('1d');
  const [investment, setInvestment] = useState<string>('');
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchTerm) {
      searchStocks(searchTerm);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  const searchStocks = async (query: string) => {
    setIsSearching(true);
    try {
      const response = await fetch(`https://finnhub.io/api/v1/search?q=${query}&token=clgbi99r01qk6rkqeeq0clgbi99r01qk6rkqefqg`);
      const data = await response.json();
      setSearchResults(data.result || []);
    } catch (err) {
      console.error("Stock search error:", err);
      toast({
        title: "Error searching stocks",
        description: "There was an issue searching for stocks. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false);
    }
  };

  const handleSymbolSelect = (symbol: any) => {
    setSelectedSymbol(symbol);
    setSearchResults([]);
    setSearchParams({ symbol: symbol.symbol });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSymbol?.symbol) return;
    
    setIsLoading(true);
    setPredictionResult(null);
    setError(null);
    
    try {
      const response = await supabase.functions.invoke('predict-movement', {
        body: {
          symbol: selectedSymbol.symbol,
          timeframe,
          investment: parseFloat(investment) || 0
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to get prediction');
      }

      const result = response.data;
      setPredictionResult(result);

      // Auto-save prediction to database
      if (user && result) {
        try {
          savePrediction({
            user_id: user.id,
            symbol: selectedSymbol.symbol,
            timeframe,
            investment: parseFloat(investment) || undefined,
            current_price: result.current_price,
            expected_move_percent: result.expected_move_percent,
            expected_move_direction: result.expected_move_direction,
            price_target_min: result.price_target_min,
            price_target_max: result.price_target_max,
            recommendation: result.recommendation,
            confidence: result.confidence,
            patterns: result.patterns,
            key_levels: result.key_levels,
            risks: result.risks,
            opportunities: result.opportunities,
            rationale: result.rationale,
            raw_response: result,
          });
        } catch (saveError) {
          console.log('Note: Prediction generated but not saved to history:', saveError);
        }
      }
    } catch (err) {
      console.error('Prediction error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercentage = (value?: number) => {
    if (!value) return 'N/A';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen container mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Market Predictor</h1>
          <p className="text-muted-foreground">
            Enter a stock symbol and timeframe to get an AI-powered prediction.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Prediction Input</CardTitle>
            <CardDescription>Enter the details for your prediction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Input
                type="search"
                placeholder="Search for a stock symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
              {isSearching && (
                <div className="absolute inset-y-0 right-3 flex items-center">
                  <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="absolute left-0 mt-2 w-full rounded-md border bg-popover text-popover-foreground shadow-md z-10">
                  {searchResults.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No results found.</div>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto py-1">
                      {searchResults.map((result) => (
                        <li
                          key={result.symbol}
                          className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          onClick={() => handleSymbolSelect(result)}
                        >
                          {result.description} ({result.symbol})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {selectedSymbol && (
              <div className="space-y-2">
                <p>Selected: {selectedSymbol?.description} ({selectedSymbol?.symbol})</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="timeframe">Timeframe</Label>
                    <Select value={timeframe} onValueChange={setTimeframe}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1d">1 Day</SelectItem>
                        <SelectItem value="1w">1 Week</SelectItem>
                        <SelectItem value="1m">1 Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="investment">Investment Amount (Optional)</Label>
                    <Input
                      type="number"
                      id="investment"
                      placeholder="Enter amount"
                      value={investment}
                      onChange={(e) => setInvestment(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
              onClick={handleSubmit}
              disabled={!selectedSymbol || isLoading}
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Get Prediction
            </button>

            {error && <p className="text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {predictionResult && (
          <Card>
            <CardHeader>
              <CardTitle>Prediction Result</CardTitle>
              <CardDescription>AI-powered prediction for {selectedSymbol?.description} ({selectedSymbol?.symbol})</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Current Price</p>
                  <p>{formatCurrency(predictionResult.current_price)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Expected Move</p>
                  <p>{formatPercentage(predictionResult.expected_move_percent)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Direction</p>
                  <Badge variant={predictionResult.expected_move_direction?.toLowerCase().includes('up') ? 'default' : 'destructive'}>
                    {predictionResult.expected_move_direction}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium">Confidence</p>
                  <p>{predictionResult.confidence?.toFixed(1)}%</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Recommendation</p>
                <p>{predictionResult.recommendation}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Rationale</p>
                <p>{predictionResult.rationale}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PredictPage;
