import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

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

  // Search symbols using Supabase edge function for global market coverage
  const searchSymbols = async (query: string): Promise<SymbolData[]> => {
    if (!query || query.length < 1) return [];

    try {
      const { data, error } = await supabase.functions.invoke('search-symbols', {
        body: { q: query }
      });

      if (error) {
        console.error('Symbol search error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Symbol search failed:', error);
      return [];
    }
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
          className="w-full justify-between hover:bg-background focus:bg-background data-[state=open]:bg-background data-[state=open]:ring-2 data-[state=open]:ring-primary/40"
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