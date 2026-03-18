import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ChevronDown, BarChart2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  simulateNextTick,
  generateInitialState,
  TICK_SYMBOLS,
  formatVolume,
  ChartSimState
} from '../utils/tickSimulator';

// Ask side (right) - green spectrum
const ASK_STRONG = '#00C853';   // bright green
const ASK_MILD   = '#B9F6CA';   // pale mint green

// Bid side (left) - red spectrum  
const BID_STRONG = '#FF1744';   // bright red
const BID_MILD   = '#FF8A80';   // light pink/rose

// Special
const VOLUME_SPIKE = '#FF6D00'; // orange - for outlier large volumes
const NEUTRAL = '#000000'; // empty cells stay black

const getBidColor = (bid: number, ask: number, isHighVolume: boolean) => {
  if (isHighVolume) return VOLUME_SPIKE;
  const ratio = bid / (ask || 1);
  if (ratio >= 3) return BID_STRONG;
  if (ratio >= 1.5) return BID_MILD;
  return '#1e1e2e'; // dark neutral — visible but not colored
};

const getAskColor = (bid: number, ask: number, isHighVolume: boolean) => {
  if (isHighVolume) return VOLUME_SPIKE;
  const ratio = ask / (bid || 1);
  if (ratio >= 3) return ASK_STRONG;
  if (ratio >= 1.5) return ASK_MILD;
  return '#1e1e2e'; // dark neutral — visible but not colored
};

const getTextColor = (bgColor: string) => {
  if (bgColor === '#000000') return '#000000'; // invisible on empty
  if (bgColor === '#1e1e2e') return '#888888'; // dim text on neutral
  return '#ffffff'; // white on colored
};

const TIMEFRAMES = ['1m', '5m', '30m', '1h', '1d', '1w', '1M'];

const refreshRateMap: Record<string, number> = {
  '1m':  3000,
  '5m':  3000,
  '30m': 8000,
  '1h':  15000,
  '1d':  30000,
  '1w':  60000,
  '1M':  120000,
};

const TickChart: React.FC = () => {
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState(TICK_SYMBOLS[0]);
  const [timeframe, setTimeframe] = useState('5m');
  const [chartState, setChartState] = useState<ChartSimState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChartState(generateInitialState(symbol, timeframe));
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!chartState) return;

    const rate = refreshRateMap[timeframe] ?? 3000;

    const intervalId = setInterval(() => {
      setChartState(prev => prev ? simulateNextTick(prev) : null);
    }, rate);

    return () => clearInterval(intervalId);
  }, [chartState?.symbol, timeframe]);

  // Auto-scroll to latest column
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [chartState?.columns.length, chartState?.columns]); // Runs every tick

  const renderedGrid = useMemo(() => {
    if (!chartState) return null;
    const { columns, priceLevels } = chartState;
    return columns.map((col, cIdx) => (
      <div key={`col-${cIdx}`} className="flex flex-col border-r border-gray-800/50 flex-1 min-w-[70px]">
        {priceLevels.map((price, pIdx) => {
          const cellData = col.prices[price];
          if (!cellData || (cellData.bid === 0 && cellData.ask === 0)) {
            return (
              <div 
                key={`cell-${cIdx}-${pIdx}`} 
                className={`flex-1 flex items-center justify-center p-0.5 border-b border-gray-800/20`}
                style={{ background: '#000000' }}
              ></div>
            );
          }
          const { bid, ask, isHighVolume } = cellData;
          
          const bidBg = getBidColor(bid, ask, isHighVolume);
          const askBg = getAskColor(bid, ask, isHighVolume);

          return (
            <div 
              key={`cell-${cIdx}-${pIdx}`} 
              className={`flex-1 flex w-full text-[10px] border-b border-gray-800/50 bg-[#1a1a1a] ${isHighVolume ? 'font-bold outline outline-1 outline-white/30 z-10 brightness-110' : ''}`}
            >
              <span 
                className="flex-1 flex items-center justify-start pl-1" 
                style={{ 
                  background: bidBg, 
                  color: getTextColor(bidBg) 
                }}
              >
                {bid === 0 ? '' : formatVolume(bid)}
              </span>
              <span 
                className="flex-1 flex items-center justify-end pr-1" 
                style={{ 
                  background: askBg, 
                  color: getTextColor(askBg) 
                }}
              >
                {ask === 0 ? '' : formatVolume(ask)}
              </span>
            </div>
          );
        })}
        <div className="h-[24px] shrink-0 flex items-center justify-center text-[10px] border-t border-gray-700 text-gray-400 bg-[#141414]">
          {col.timeLabel}
        </div>
      </div>
    ));
  }, [chartState]);

  if (!chartState) return <div className="min-h-screen bg-[#0a0a0a] text-white p-4 flex items-center justify-center">Loading Tick Engine...</div>;

  const { priceLevels, columns, orderBook, currentPrice, stats } = chartState;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-gray-200 overflow-hidden font-mono select-none">
      {/* Top Header */}
      <div className="flex flex-col border-b border-gray-800 bg-[#111] p-2 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 sm:mb-1">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center justify-center p-1.5 rounded bg-[#1e1e1e] border border-gray-700 hover:bg-[#252525] text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="relative group shrink-0">
            <select 
              className="appearance-none bg-[#1e1e1e] border border-gray-700 rounded px-3 py-1 pr-8 text-white focus:outline-none cursor-pointer hover:bg-[#252525] transition-colors"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {TICK_SYMBOLS.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          
          <div className="flex items-center space-x-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'bg-[#1e1e1e] text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400">
            <span>O: <span className="text-white">{stats.O.toFixed(1)}</span></span>
            <span>H: <span className="text-white">{stats.H.toFixed(1)}</span></span>
            <span>L: <span className="text-white">{stats.L.toFixed(1)}</span></span>
            <span>C: <span className="text-white">{stats.C.toFixed(1)}</span></span>
            <span>V: <span className="text-white">{stats.V.toFixed(2)}M</span></span>
            <span>OI: <span className="text-white">{stats.OI.toFixed(1)}</span></span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 text-[11px] text-gray-400">
          <div className="flex items-center space-x-2 shrink-0">
            <BarChart2 className="w-3 h-3 text-emerald-500" />
            <span>IMBALANCE Block: <span className="text-white">{stats.imbBlock}</span></span>
          </div>
          <span>VOLUME: <span className="text-white">{(stats.buyVol + stats.sellVol).toFixed(2)}M</span></span>
          <span>Buy Vol: <span className="text-green-500">{stats.buyVol.toFixed(2)}M</span></span>
          <span>Sell Vol: <span className="text-red-500">{stats.sellVol.toFixed(2)}M</span></span>
          <span>Buy Trades: <span className="text-white">{stats.buyTrades}</span></span>
          <span>Sell Trades: <span className="text-white">{stats.sellTrades}</span></span>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Horizontal Scrollable Area */}
        <div 
          ref={scrollRef}
          className="flex overflow-x-auto overflow-y-hidden flex-1 pb-4 scroll-smooth w-full"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {renderedGrid}
        </div>

        {/* Static Order Book & Prices Panel */}
        <div className="flex flex-col w-[80px] bg-[#111] border-l border-gray-800 shrink-0 shadow-[-10px_0_20px_rgba(0,0,0,0.5)] z-10">
          <div className="flex-1 flex flex-col pb-4">
            {orderBook.map((row, i) => {
              const isActive = Math.abs(row.price - currentPrice) < 0.1; 
              
              // In the reference image, the right Y-axis is just a single thin column
              // showing the price, often highlighted. The order book depth is actually 
              // integrated into the main chart or just isn't split into two bid/ask columns on the Y-axis.
              // Let's make it a single, clean price column to match the time X-axis style.
              return (
                <div key={`ob-row-${i}`} className={`flex flex-1 group relative border-b border-gray-800/50
                  ${isActive ? 'bg-cyan-900 border-cyan-400 z-10' : 'bg-[#181818]'}`}>
                  
                  {/* Cyan Highlight overlay for the active row */}
                  {isActive && (
                    <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-cyan-400 z-20"></div>
                  )}

                  <div className={`flex-1 flex items-center justify-center text-[11px] font-medium
                    ${isActive ? 'text-white' : 'text-gray-400'}`}>
                    {row.price % 1 === 0 ? row.price.toLocaleString() : row.price.toFixed(1).toLocaleString()}
                  </div>
                </div>
              );
            })}
            
            <div className="h-[24px] shrink-0 bg-[#141414] border-t border-gray-700 flex items-center justify-center text-[10px] text-gray-500">
              Price
            </div>
          </div>
        </div>

      </div>
      
    </div>
  );
};

export default TickChart;
