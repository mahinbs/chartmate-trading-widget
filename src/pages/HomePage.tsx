import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, BarChart3, PlusCircle, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <TrendingUp className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">our ai probability software</h1>
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AI-Powered Trading Intelligence
          </h2>
          <p className="text-xl text-muted-foreground">
            Make smarter trading decisions with real-time AI analysis and trade tracking
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Create New Prediction */}
          <Card className="border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg cursor-pointer group"
            onClick={() => navigate('/predict')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-lg group-hover:scale-110 transition-transform">
                  <PlusCircle className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div>Create New Prediction</div>
                  <p className="text-sm font-normal text-muted-foreground mt-1">
                    Get AI analysis for any stock, crypto, or forex
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                  Multi-horizon AI forecasts
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                  Personalized risk management
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                  Real-time market analysis
                </li>
              </ul>
              <Button className="w-full mt-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600">
                Start New Analysis
              </Button>
            </CardContent>
          </Card>

          {/* View Current Predictions/Trades */}
          <Card className="border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg cursor-pointer group"
            onClick={() => navigate('/active-trades')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg group-hover:scale-110 transition-transform">
                  <Eye className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div>View Active Trades</div>
                  <p className="text-sm font-normal text-muted-foreground mt-1">
                    Track your live positions in real-time
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                  Real-time P&L tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                  Countdown timers & alerts
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                  Live price updates every 30s
                </li>
              </ul>
              <Button className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600">
                View Active Trades
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Additional Options */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate('/predictions')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-primary" />
                Past Predictions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Review your prediction history
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate('/active-trades?tab=completed')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View completed trades & stats
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Features Highlight */}
        <Card className="mt-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle>✨ Platform Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">🤖 AI Analysis</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Gemini AI-powered predictions</li>
                  <li>• Multi-timeframe forecasts</li>
                  <li>• Sentiment & news analysis</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">📊 Trade Tracking</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Real-time P&L calculations</li>
                  <li>• Automatic price updates</li>
                  <li>• Smart notifications</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">⚡ Risk Management</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Auto stop-loss & take-profit</li>
                  <li>• Position sizing calculator</li>
                  <li>• Risk-adjusted recommendations</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">🎯 Personalization</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Custom trading profiles</li>
                  <li>• Strategy-based analysis</li>
                  <li>• Market hours detection</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
