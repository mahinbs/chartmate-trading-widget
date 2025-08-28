import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LightweightPriceChartProps {
  symbol: string;
  interval: string;
  height?: number;
}

interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface OHLCVResponse {
  symbol: string;
  interval: string;
  data: OHLCVCandle[];
  provider: string;
}

async function fetchOHLCVData(symbol: string, interval: string): Promise<OHLCVResponse> {
  const { data, error } = await supabase.functions.invoke('ohlcv', {
    body: { symbol, interval }
  });
  
  if (error) {
    throw new Error(error.message);
  }
  
  return data;
}

export default function LightweightPriceChart({ symbol, interval, height = 400 }: LightweightPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');

  // Fetch OHLCV data
  const { data: ohlcvData, isLoading, error, refetch } = useQuery({
    queryKey: ['ohlcv', symbol, interval],
    queryFn: () => fetchOHLCVData(symbol, interval),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });

  // Detect theme changes
  useEffect(() => {
    const detectTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                    window.matchMedia('(prefers-color-scheme: dark)').matches;
      setCurrentTheme(isDark ? 'dark' : 'light');
    };
    
    detectTheme();
    
    // Listen for theme changes
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: currentTheme === 'dark' ? '#0F0F0F' : '#FFFFFF' },
        textColor: currentTheme === 'dark' ? '#D9D9D9' : '#191919',
        fontSize: 12,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      },
      grid: {
        vertLines: {
          color: currentTheme === 'dark' ? 'rgba(242, 242, 242, 0.06)' : 'rgba(25, 25, 25, 0.1)',
        },
        horzLines: {
          color: currentTheme === 'dark' ? 'rgba(242, 242, 242, 0.06)' : 'rgba(25, 25, 25, 0.1)',
        },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: currentTheme === 'dark' ? 'rgba(242, 242, 242, 0.2)' : 'rgba(25, 25, 25, 0.2)',
      },
      timeScale: {
        borderColor: currentTheme === 'dark' ? 'rgba(242, 242, 242, 0.2)' : 'rgba(25, 25, 25, 0.2)',
        timeVisible: true,
        secondsVisible: interval === '1' || interval === '5',
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // @ts-ignore - addCandlestickSeries exists but TypeScript definition might be outdated
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: currentTheme === 'dark' ? '#26a69a' : '#00C851',
      downColor: currentTheme === 'dark' ? '#ef5350' : '#FF4444',
      borderVisible: false,
      wickUpColor: currentTheme === 'dark' ? '#26a69a' : '#00C851',
      wickDownColor: currentTheme === 'dark' ? '#ef5350' : '#FF4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [currentTheme, height]);

  // Update chart data
  useEffect(() => {
    if (ohlcvData?.data && seriesRef.current) {
      const candlestickData: CandlestickData[] = ohlcvData.data.map(candle => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

      seriesRef.current.setData(candlestickData);
      
      // Fit chart to content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [ohlcvData]);

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load chart data: {error.message}
              <button 
                onClick={() => refetch()} 
                className="ml-2 text-primary hover:underline"
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardContent className="p-0 h-full relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading chart data...</span>
            </div>
          </div>
        )}
        
        <div 
          ref={chartContainerRef} 
          className="w-full h-full rounded-lg overflow-hidden"
          style={{ height: `${height}px` }}
        />
        
        {ohlcvData && (
          <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded">
            Data by {ohlcvData.provider}
          </div>
        )}
      </CardContent>
    </Card>
  );
}