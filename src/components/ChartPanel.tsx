import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LightweightPriceChart from './LightweightPriceChart';
import { BarChart3, Loader2 } from 'lucide-react';

interface ChartPanelProps {
  defaultSymbol?: string;
  defaultInterval?: string;
  onAnalyzeChart?: (symbol: string, interval: string) => void;
  isAnalyzing?: boolean;
}

const POPULAR_SYMBOLS = [
  { value: "NASDAQ:AAPL", label: "Apple (AAPL)" },
  { value: "NASDAQ:GOOGL", label: "Google (GOOGL)" },
  { value: "NASDAQ:MSFT", label: "Microsoft (MSFT)" },
  { value: "NASDAQ:TSLA", label: "Tesla (TSLA)" },
  { value: "NYSE:SPY", label: "S&P 500 ETF (SPY)" },
  { value: "NASDAQ:QQQ", label: "Nasdaq ETF (QQQ)" },
  { value: "BINANCE:BTCUSDT", label: "Bitcoin (BTC)" },
  { value: "BINANCE:ETHUSDT", label: "Ethereum (ETH)" },
  { value: "OANDA:EUR_USD", label: "EUR/USD" },
  { value: "OANDA:GBP_USD", label: "GBP/USD" },
  { value: "OANDA:USD_JPY", label: "USD/JPY" },
];

const INTERVALS = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "D", label: "1D" },
  { value: "W", label: "1W" },
];

export default function ChartPanel({ defaultSymbol = "NASDAQ:AAPL", defaultInterval = "D", onAnalyzeChart, isAnalyzing = false }: ChartPanelProps) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setInterval] = useState(defaultInterval);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 relative z-10">
        <div className="flex gap-2 items-center mb-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POPULAR_SYMBOLS.map((sym) => (
                <SelectItem key={sym.value} value={sym.value}>
                  {sym.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((int) => (
                <SelectItem key={int.value} value={int.value}>
                  {int.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {onAnalyzeChart && (
          <Button
            onClick={() => onAnalyzeChart(symbol, interval)}
            disabled={isAnalyzing}
            variant="outline"
            size="sm"
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Chart...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Analyze Current Chart
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="h-full bg-background">
          <LightweightPriceChart symbol={symbol} interval={interval} />
        </div>
      </CardContent>
    </Card>
  );
}