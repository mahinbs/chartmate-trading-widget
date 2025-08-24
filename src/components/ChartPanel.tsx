import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import TradingViewWidget from './TradingViewWidget';

interface ChartPanelProps {
  defaultSymbol?: string;
  defaultInterval?: string;
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

export default function ChartPanel({ defaultSymbol = "NASDAQ:AAPL", defaultInterval = "D" }: ChartPanelProps) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setInterval] = useState(defaultInterval);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex gap-2 items-center">
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
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="h-full bg-chart-bg">
          <TradingViewWidget symbol={symbol} interval={interval} />
        </div>
      </CardContent>
    </Card>
  );
}