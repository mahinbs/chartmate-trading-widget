import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import HomePage from "./pages/HomePage";
import PredictPage from "./pages/PredictPage";
import PredictionsPage from "./pages/PredictionsPage";
import SavedAnalysisRedirect from "./pages/SavedAnalysisRedirect";
import IntradayPage from "./pages/IntradayPage";
import ActiveTradesPage from "./pages/ActiveTradesPage";
import ActiveTradeDetailsPage from "./pages/ActiveTradeDetailsPage";
import AuthPage from "./pages/AuthPage";
import BrokerCallbackPage from "./pages/BrokerCallbackPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import WhiteLabelPage from "./pages/WhiteLabelPage";
import TermsOfService from "./pages/TermsOfService";
import RiskDisclaimer from "./pages/RiskDisclaimer";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ContactUsPage from "./pages/ContactUs";
import MarketPicksPage from "./pages/MarketPicksPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminPredictionsPage from "./pages/admin/AdminPredictionsPage";
import AdminBlogsPage from "./pages/admin/AdminBlogsPage";
import AdminPublicDashboardPage from "./pages/admin/AdminPublicDashboardPage";
import AdminAffiliatesPage from "./pages/admin/AdminAffiliatesPage";
import AdminContactsPage from "./pages/admin/AdminContactsPage";
import AdminWhitelabelsPage from "./pages/admin/AdminWhitelabelsPage";
import AdminAlgoRequestsPage from "./pages/admin/AdminAlgoRequestsPage";
import BlogsPage from "./pages/BlogsPage";
import BlogDetailPage from "./pages/BlogDetailPage";
import PublicDashboardPage from "./pages/PublicDashboardPage";
import WhitelabelLoginPage from "./pages/WhitelabelLoginPage";
import WhitelabelDashboardPage from "./pages/WhitelabelDashboardPage";
import { AdminRoute } from "./components/AdminRoute";
import { AdminLayout } from "./components/admin/AdminLayout";
import MainLandingPage from "./pages/MainLandingPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import { AffiliateRoute } from "./components/AffiliateRoute";
import { HelmetProvider } from "react-helmet-async";
import { PlatformChatbot } from "./components/PlatformChatbot";
import RegisterPage from "./pages/RegisterPage";
import AIPobabilityEnginePage from "./pages/AIPobabilityEnginePage";
import AffiliatePartnerPage from "./pages/AffiliatePartnerPage";
import TradingDashboardPage from "./pages/TradingDashboardPage";
import TradingAiAnalysisPage from "./pages/TradingAiAnalysisPage";
import TradingBacktestPage from "./pages/TradingBacktestPage";
import WlCheckoutPage from "./pages/WlCheckoutPage";
import AlgoOnboardingPage from "./pages/AlgoOnboardingPage";
import StrategiesPage from "./pages/StrategiesPage";
import NewsPage from "./pages/NewsPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import TickChart from "./pages/TickChart";
import PricingPage from "./pages/PricingPage";
import { PredictionChatbot } from "./components/PredictionChatbot";
import { useAuth } from "./hooks/useAuth";
import { useLocation } from "react-router-dom";
import { AlgoToolsDashboardLayout } from "./components/layout/AlgoToolsDashboardLayout";

// OpenAlgo ping temporarily disabled in mock-order mode to avoid CORS noise

const queryClient = new QueryClient();

/** Public marketing site — platform / product enquiry chatbot (guests only). */
function isPublicMarketingPath(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return false;
  const exact = new Set([
    "/",
    "/pricing",
    "/rsb-fintech-founder",
    "/dsn-fintech-founder",
    "/contact-us",
    "/white-label",
    "/terms",
    "/risk-disclaimer",
    "/privacy-policy",
    "/ai-probability-engine",
    "/affiliate-partner",
    "/dashboard",
    "/market-picks",
  ]);
  if (exact.has(pathname)) return true;
  if (pathname === "/blogs" || pathname.startsWith("/blogs/")) return true;
  if (/^\/wl\/[^/]+$/.test(pathname)) return true;
  return false;
}

/** Logged-in trading app — stock / market assistant chatbot. */
function isLoggedInAppPath(pathname: string): boolean {
  if (pathname === "/tick-chart") return false;
  if (pathname === "/auth" || pathname === "/register") return false;
  if (pathname.startsWith("/auth/") && pathname !== "/auth/change-password") return false;
  if (pathname.startsWith("/admin")) return false;

  if (pathname === "/auth/change-password") return true;
  if (pathname.startsWith("/predictions")) return true;
  if (pathname.startsWith("/trade/")) return true;
  if (pathname.startsWith("/trading-dashboard")) return true;
  if (pathname.startsWith("/wl-checkout/")) return true;
  if (/^\/wl\/[^/]+\/dashboard/.test(pathname)) return true;

  const exactApp = new Set([
    "/home",
    "/predict",
    "/intraday",
    "/active-trades",
    "/news",
    "/ai-trading-analysis",
    "/backtest",
    "/strategies",
    "/broker-callback",
    "/affiliate/dashboard",
    "/algo-setup",
    "/market-picks",
  ]);
  if (exactApp.has(pathname)) return true;
  if (pathname.startsWith("/news/")) return true;

  return false;
}

function AppChatbots() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [predictionOpen, setPredictionOpen] = useState(false);

  const showPredictionChatbot = !!user && isLoggedInAppPath(pathname);
  /** Marketing pages: platform bot unless the logged-in app assistant already owns this URL (e.g. /market-picks). */
  const showPlatformChatbot =
    isPublicMarketingPath(pathname) && !showPredictionChatbot;

  return (
    <>
      {showPlatformChatbot ? <PlatformChatbot /> : null}
      {showPredictionChatbot ? (
        <PredictionChatbot open={predictionOpen} setOpen={setPredictionOpen} />
      ) : null}
    </>
  );
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen bg-background text-foreground">
            <Routes>
              <Route path="/rsb-fintech-founder" element={<LandingPage />} />
              <Route path="/dsn-fintech-founder" element={<LandingPage />} />
              <Route path="/white-label" element={<WhiteLabelPage />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/risk-disclaimer" element={<RiskDisclaimer />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/" element={<MainLandingPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/ai-probability-engine" element={<AIPobabilityEnginePage />} />
              <Route path="/affiliate-partner" element={<AffiliatePartnerPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AlgoToolsDashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/ai-trading-analysis" element={<TradingAiAnalysisPage />} />
                <Route path="/backtest" element={<TradingBacktestPage />} />
              </Route>
              <Route
                path="/trading-dashboard"
                element={
                  <ProtectedRoute>
                    <TradingDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/wl-checkout/:token" element={<WlCheckoutPage />} />
              <Route path="/algo-setup" element={<AlgoOnboardingPage />} />
              <Route path="/tick-chart" element={<TickChart />} />
              <Route
                path="/strategies"
                element={
                  <ProtectedRoute>
                    <StrategiesPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/contact-us" element={<ContactUsPage />} />
              <Route path="/blogs" element={<BlogsPage />} />
              <Route path="/blogs/:slug" element={<BlogDetailPage />} />
              <Route path="/dashboard" element={<PublicDashboardPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/auth/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
              <Route path="/affiliate/dashboard" element={<AffiliateRoute><AffiliateDashboard /></AffiliateRoute>} />
              <Route
                path="/broker-callback"
                element={
                  <ProtectedRoute>
                    <BrokerCallbackPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/predict"
                element={
                  <ProtectedRoute>
                    <PredictPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/predictions"
                element={
                  <ProtectedRoute>
                    <PredictionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/predictions/:predictionId/full"
                element={
                  <ProtectedRoute>
                    <SavedAnalysisRedirect />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/intraday"
                element={
                  <ProtectedRoute>
                    <IntradayPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/active-trades"
                element={
                  <ProtectedRoute>
                    <ActiveTradesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/news"
                element={
                  <ProtectedRoute>
                    <NewsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/news/:articleId"
                element={
                  <ProtectedRoute>
                    <NewsDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trade/:id"
                element={
                  <ProtectedRoute>
                    <ActiveTradeDetailsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market-picks"
                element={<MarketPicksPage />}
              />
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="predictions" element={<AdminPredictionsPage />} />
                <Route path="blogs" element={<AdminBlogsPage />} />
                <Route path="dashboard" element={<PublicDashboardPage embedInAdmin />} />
                <Route path="public-dashboard" element={<AdminPublicDashboardPage />} />
                <Route path="affiliates" element={<AdminAffiliatesPage />} />
                <Route path="contacts" element={<AdminContactsPage />} />
                <Route path="whitelabels" element={<AdminWhitelabelsPage />} />
                <Route path="algo-requests" element={<AdminAlgoRequestsPage />} />
              </Route>
              <Route path="/wl/:slug" element={<WhitelabelLoginPage />} />
              <Route path="/wl/:slug/dashboard" element={<WhitelabelDashboardPage />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
            <AppChatbots />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
