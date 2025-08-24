import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SymbolData {
  symbol: string;
  description: string;
  exchange: string;
  type: string;
  full_symbol: string;
}

interface SymbolSearchProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function SymbolSearch({ value, onValueChange, placeholder = "Search symbols..." }: SymbolSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [symbols, setSymbols] = useState<SymbolData[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock TradingView symbol search - in reality this would call TradingView's API
  const searchSymbols = async (query: string): Promise<SymbolData[]> => {
    if (!query || query.length < 2) return [];
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Mock data representing global symbols from TradingView
    const mockSymbols: SymbolData[] = [
      // Popular US Stocks
      { symbol: "AAPL", description: "Apple Inc", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:AAPL" },
      { symbol: "GOOGL", description: "Alphabet Inc", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:GOOGL" },
      { symbol: "MSFT", description: "Microsoft Corporation", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:MSFT" },
      { symbol: "TSLA", description: "Tesla Inc", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:TSLA" },
      { symbol: "AMZN", description: "Amazon.com Inc", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:AMZN" },
      { symbol: "NVDA", description: "NVIDIA Corporation", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:NVDA" },
      { symbol: "META", description: "Meta Platforms Inc", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:META" },
      
      // Crypto
      { symbol: "BTCUSD", description: "Bitcoin / US Dollar", exchange: "BINANCE", type: "crypto", full_symbol: "BINANCE:BTCUSD" },
      { symbol: "ETHUSD", description: "Ethereum / US Dollar", exchange: "BINANCE", type: "crypto", full_symbol: "BINANCE:ETHUSD" },
      { symbol: "SOLUSD", description: "Solana / US Dollar", exchange: "BINANCE", type: "crypto", full_symbol: "BINANCE:SOLUSD" },
      { symbol: "ADAUSD", description: "Cardano / US Dollar", exchange: "BINANCE", type: "crypto", full_symbol: "BINANCE:ADAUSD" },
      
      // Forex
      { symbol: "EURUSD", description: "Euro / US Dollar", exchange: "FX", type: "forex", full_symbol: "FX:EURUSD" },
      { symbol: "GBPUSD", description: "British Pound / US Dollar", exchange: "FX", type: "forex", full_symbol: "FX:GBPUSD" },
      { symbol: "JPYUSD", description: "Japanese Yen / US Dollar", exchange: "FX", type: "forex", full_symbol: "FX:JPYUSD" },
      { symbol: "AUDUSD", description: "Australian Dollar / US Dollar", exchange: "FX", type: "forex", full_symbol: "FX:AUDUSD" },
      
      // International Stocks
      { symbol: "RELIANCE", description: "Reliance Industries Ltd", exchange: "NSE", type: "stock", full_symbol: "NSE:RELIANCE" },
      { symbol: "TCS", description: "Tata Consultancy Services", exchange: "NSE", type: "stock", full_symbol: "NSE:TCS" },
      { symbol: "BABA", description: "Alibaba Group Holding Ltd", exchange: "NYSE", type: "stock", full_symbol: "NYSE:BABA" },
      { symbol: "ASML", description: "ASML Holding NV", exchange: "NASDAQ", type: "stock", full_symbol: "NASDAQ:ASML" },
      { symbol: "SAP", description: "SAP SE", exchange: "NYSE", type: "stock", full_symbol: "NYSE:SAP" },
      
      // Commodities
      { symbol: "GOLD", description: "Gold Futures", exchange: "COMEX", type: "commodity", full_symbol: "COMEX:GC1!" },
      { symbol: "SILVER", description: "Silver Futures", exchange: "COMEX", type: "commodity", full_symbol: "COMEX:SI1!" },
      { symbol: "OIL", description: "Crude Oil WTI", exchange: "NYMEX", type: "commodity", full_symbol: "NYMEX:CL1!" },
      
      // Indices
      { symbol: "SPX", description: "S&P 500 Index", exchange: "SP", type: "index", full_symbol: "SP:SPX" },
      { symbol: "DJI", description: "Dow Jones Industrial Average", exchange: "DJ", type: "index", full_symbol: "DJ:DJI" },
      { symbol: "NDQ", description: "NASDAQ 100 Index", exchange: "NASDAQ", type: "index", full_symbol: "NASDAQ:NDX" },
    ];
    
    // Filter symbols based on query
    return mockSymbols.filter(s => 
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 20);
  };

  useEffect(() => {
    if (searchQuery) {
      setLoading(true);
      searchSymbols(searchQuery)
        .then(setSymbols)
        .finally(() => setLoading(false));
    } else {
      setSymbols([]);
    }
  }, [searchQuery]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "stock": return "bg-blue-100 text-blue-800 border-blue-200";
      case "crypto": return "bg-orange-100 text-orange-800 border-orange-200";
      case "forex": return "bg-green-100 text-green-800 border-green-200";
      case "commodity": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "index": return "bg-purple-100 text-purple-800 border-purple-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const selectedSymbol = symbols.find(s => s.full_symbol === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedSymbol ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedSymbol.symbol}</span>
              <Badge variant="outline" className={getTypeColor(selectedSymbol.type)}>
                {selectedSymbol.type}
              </Badge>
              <span className="text-muted-foreground truncate">{selectedSymbol.description}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border border-white/10 shadow-xl z-50" align="start">
        <Command>
          <CommandInput
            placeholder="Search stocks, crypto, forex..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="ml-2 text-sm">Searching...</span>
                </div>
              ) : (
                "No symbols found."
              )}
            </CommandEmpty>
            {symbols.length > 0 && (
              <CommandGroup>
                {symbols.map((symbol) => (
                  <CommandItem
                    key={symbol.full_symbol}
                    value={symbol.full_symbol}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === symbol.full_symbol ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                          {symbol.symbol.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{symbol.symbol}</span>
                      <Badge variant="outline" className={getTypeColor(symbol.type)}>
                        {symbol.type}
                      </Badge>
                      <span className="text-muted-foreground text-sm truncate">
                        {symbol.description}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {symbol.exchange}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}