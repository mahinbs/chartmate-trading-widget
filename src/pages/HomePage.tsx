import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, BarChart3, PlusCircle, Eye, Sparkles, ShieldCheck, KeyRound, BrainCircuit } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useTradingIntegration } from "@/hooks/useTradingIntegration";
import { TradingIntegrationModal } from "@/components/trading/TradingIntegrationModal";
import logo from '../assets/logo.png'

export default function HomePage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isAdmin } = useAdmin();
  const { hasIntegration, save, refresh } = useTradingIntegration();
  const [showBrokerModal, setShowBrokerModal] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity group"
          >
            <img src={logo} alt="logo" className="md:w-[8rem] w-[6rem] object-contain" />
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:inline-block">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => signOut()} className="border-white/10 hover:bg-white/5">
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium uppercase tracking-wider mb-2">
            <Sparkles className="h-3 w-3" /> AI-Powered Intelligence
          </div>
          <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 tracking-tight pb-2">
            Trading Intelligence Platform
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Make smarter trading decisions with real-time AI analysis, probability scoring, and automated trade tracking.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Create New Analysis */}
          <Card className="glass-panel border-primary/20 hover:border-primary/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(20,184,166,0.1)] cursor-pointer group relative overflow-hidden"
            onClick={() => navigate('/predict')}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-4 text-2xl">
                <div className="p-3.5 bg-primary/10 rounded-xl border border-primary/20 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-primary/5">
                  <PlusCircle className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <div className="font-bold">New Analysis</div>
                  <p className="text-sm font-normal text-muted-foreground mt-1">
                    Get AI forecast for any asset
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(20,184,166,0.6)]"></div>
                  Multi-horizon AI forecasts (15m to 1w)
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(20,184,166,0.6)]"></div>
                  Personalized risk management
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(20,184,166,0.6)]"></div>
                  Real-time market sentiment analysis
                </li>
              </ul>
              <Button className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 shadow-[0_0_20px_rgba(20,184,166,0.2)] hover:shadow-[0_0_25px_rgba(20,184,166,0.4)] transition-all">
                Start New Analysis
              </Button>
            </CardContent>
          </Card>

          {/* View Current Analyses/Trades */}
          <Card className="glass-panel border-secondary/20 hover:border-secondary/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(14,165,233,0.1)] cursor-pointer group relative overflow-hidden"
            onClick={() => navigate('/active-trades')}>
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-4 text-2xl">
                <div className="p-3.5 bg-secondary/10 rounded-xl border border-secondary/20 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-secondary/5">
                  <Eye className="h-8 w-8 text-secondary" />
                </div>
                <div>
                  <div className="font-bold">Active Trades</div>
                  <p className="text-sm font-normal text-muted-foreground mt-1">
                    Monitor live positions
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 bg-secondary rounded-full shadow-[0_0_8px_rgba(14,165,233,0.6)]"></div>
                  Real-time P&L tracking
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 bg-secondary rounded-full shadow-[0_0_8px_rgba(14,165,233,0.6)]"></div>
                  Smart alerts & countdown timers
                </li>
                <li className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 bg-secondary rounded-full shadow-[0_0_8px_rgba(14,165,233,0.6)]"></div>
                  Live price updates every 30s
                </li>
              </ul>
              <Button className="w-full h-12 text-base font-semibold bg-secondary hover:bg-secondary/90 text-white shadow-[0_0_20px_rgba(14,165,233,0.2)] hover:shadow-[0_0_25px_rgba(14,165,233,0.4)] transition-all">
                View Active Trades
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Additional Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="minimal-panel hover:bg-white/5 transition-colors cursor-pointer group"
            onClick={() => navigate('/predictions')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                Past Analyses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Review your complete analysis history and AI performance.
              </p>
            </CardContent>
          </Card>

          <Card className="minimal-panel hover:bg-white/5 transition-colors cursor-pointer group"
            onClick={() => navigate('/active-trades?tab=completed')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-secondary/10 transition-colors">
                  <BarChart3 className="h-5 w-5 text-secondary" />
                </div>
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Analyze your trading performance, win rates, and P&L stats.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Card className="minimal-panel hover:bg-white/5 transition-colors cursor-pointer group"
            onClick={() => navigate('/market-picks')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-yellow-500/10 transition-colors">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                </div>
                Daily Market Picks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View admin-curated top 10 symbols with live AI probability scores.
              </p>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="minimal-panel hover:bg-white/5 transition-colors cursor-pointer group"
              onClick={() => navigate('/admin')}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-red-500/10 transition-colors">
                    <ShieldCheck className="h-5 w-5 text-red-500" />
                  </div>
                  Admin Panel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Manage users and the 10-stock daily analysis board.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Features Highlight */}
        <Card className="mt-8 bg-zinc-900/30 border border-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Platform Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
              <div className="space-y-2">
                <h4 className="font-semibold text-primary flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4" /> AI Analysis
                </h4>
                <ul className="space-y-1.5 text-muted-foreground text-xs">
                  <li>• Probability-based scoring</li>
                  <li>• Multi-timeframe forecasts</li>
                  <li>• Sentiment & news analysis</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-secondary flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Trade Tracking
                </h4>
                <ul className="space-y-1.5 text-muted-foreground text-xs">
                  <li>• Real-time P&L calculations</li>
                  <li>• Automatic price updates</li>
                  <li>• Smart notifications</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-yellow-500 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Risk Management
                </h4>
                <ul className="space-y-1.5 text-muted-foreground text-xs">
                  <li>• Auto stop-loss & take-profit</li>
                  <li>• Position sizing calculator</li>
                  <li>• Risk-adjusted recommendations</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-purple-500 flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> Personalization
                </h4>
                <ul className="space-y-1.5 text-muted-foreground text-xs">
                  <li>• Custom trading profiles</li>
                  <li>• Strategy-based analysis</li>
                  <li>• Market hours detection</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <TradingIntegrationModal
          open={showBrokerModal}
          onOpenChange={setShowBrokerModal}
          onSaved={() => refresh()}
          save={async (params) => save(params)}
        />
      </div>
    </div>
  );
}
