import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ColorType } from 'lightweight-charts';
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
    // Preserve provider error details in the error context
    const enhancedError = new Error(error.message);
    (enhancedError as any).context = error;
    throw enhancedError;
  }
  
  return data;
}

export default function LightweightPriceChart({ symbol, interval, height = 400 }: LightweightPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');

  // Fetch OHLCV data
  const { data: ohlcvData, isLoading, error, refetch } = useQuery({
    queryKey: ['ohlcv', symbol, interval],
    queryFn: () => fetchOHLCVData(symbol, interval),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Detect theme changes
  useEffect(() => {
    const detectTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                    window.matchMedia('(prefers-color-scheme: dark)').matches;
      setCurrentTheme(isDark ? 'dark' : 'light');
    };
    
    detectTheme();
    
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: height,
        layout: {
          background: { 
            type: ColorType.Solid,
            color: currentTheme === 'dark' ? '#0F0F0F' : '#FFFFFF' 
          },
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

      // Try to create a line series first to verify basic functionality
      let series;
      try {
        // Check if the chart object has the methods we need
        if (typeof (chart as any).addLineSeries === 'function') {
          series = (chart as any).addLineSeries({
            color: currentTheme === 'dark' ? '#26a69a' : '#00C851',
            lineWidth: 2,
          });
        } else {
          console.error('Chart methods not available');
          return;
        }
      } catch (seriesError) {
        console.error('Error creating series:', seriesError);
        return;
      }

      chartRef.current = chart;
      seriesRef.current = series;

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

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          try {
            chartRef.current.remove();
          } catch (removeError) {
            console.error('Error removing chart:', removeError);
          }
        }
      };
    } catch (chartError) {
      console.error('Error creating chart:', chartError);
    }
  }, [currentTheme, height]);

  // Update chart data
  useEffect(() => {
    if (ohlcvData?.data && seriesRef.current) {
      try {
        // Convert OHLCV data to line data using close prices
        const lineData = ohlcvData.data.map(candle => ({
          time: candle.time,
          value: candle.close,
        }));

        seriesRef.current.setData(lineData);
        
        // Fit chart to content
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } catch (dataError) {
        console.error('Error setting chart data:', dataError);
      }
    }
  }, [ohlcvData]);

  if (error) {
    // Enhanced error display with provider details
    const errorData = (error as any)?.context;
    const providerErrors = errorData?.providerErrors || [];
    
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>Failed to load chart data: {error.message}</p>
                {providerErrors.length > 0 && (
                  <details className="text-left">
                    <summary className="cursor-pointer text-xs hover:text-foreground">
                      Provider Details ({providerErrors.length} errors)
                    </summary>
                    <div className="mt-2 text-xs space-y-1">
                      {providerErrors.map((pe: any, i: number) => (
                        <div key={i} className="p-2 bg-muted rounded">
                          <strong>{pe.provider}:</strong> {pe.message}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <button 
                  onClick={() => refetch()} 
                  className="text-primary hover:underline text-sm"
                >
                  Retry
                </button>
              </div>
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
            Data by {ohlcvData.provider} • Price Chart
          </div>
        )}
      </CardContent>
    </Card>
  );
}