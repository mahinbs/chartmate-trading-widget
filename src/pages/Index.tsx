import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import ChartPanel from "@/components/ChartPanel";

const Index = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Multi-Chart Trading Dashboard</h1>
          <p className="text-muted-foreground">Real-time market analysis across multiple assets</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-trading-green"></div>
          <span className="text-sm text-muted-foreground">Market Open</span>
        </div>
      </div>

      <div className="h-[calc(100vh-200px)]">
        <ResizablePanelGroup direction="vertical" className="gap-4">
          <ResizablePanel defaultSize={50}>
            <ResizablePanelGroup direction="horizontal" className="gap-4">
              <ResizablePanel defaultSize={50}>
                <ChartPanel defaultSymbol="NASDAQ:AAPL" defaultInterval="D" />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50}>
                <ChartPanel defaultSymbol="NASDAQ:GOOGL" defaultInterval="D" />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50}>
            <ResizablePanelGroup direction="horizontal" className="gap-4">
              <ResizablePanel defaultSize={50}>
                <ChartPanel defaultSymbol="BINANCE:BTCUSDT" defaultInterval="D" />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50}>
                <ChartPanel defaultSymbol="NYSE:SPY" defaultInterval="D" />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default Index;
