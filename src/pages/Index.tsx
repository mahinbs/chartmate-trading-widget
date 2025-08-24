import TradingViewWidget from "@/components/TradingViewWidget";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Trading Dashboard</h1>
              <p className="text-sm text-muted-foreground">Real-time market analysis</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 rounded-full bg-trading-green"></div>
                <span className="text-sm text-muted-foreground">Market Open</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4">
        <div className="grid gap-6">
          {/* Chart Section */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Advanced Chart</h2>
              <p className="text-sm text-muted-foreground">Interactive price analysis with technical indicators</p>
            </div>
            <div className="h-[600px] bg-chart-bg">
              <TradingViewWidget />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
