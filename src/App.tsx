import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PredictPage from "./pages/PredictPage";
import PredictionsPage from "./pages/PredictionsPage";
import IntradayPage from "./pages/IntradayPage";
import ActiveTradesPage from "./pages/ActiveTradesPage";
import ActiveTradeDetailsPage from "./pages/ActiveTradeDetailsPage";
import AuthPage from "./pages/AuthPage";
import BrokerCallbackPage from "./pages/BrokerCallbackPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import ContactUsPage from "./pages/ContactUs";
import MarketPicksPage from "./pages/MarketPicksPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminPredictionsPage from "./pages/admin/AdminPredictionsPage";
import AdminBlogsPage from "./pages/admin/AdminBlogsPage";
import AdminPublicDashboardPage from "./pages/admin/AdminPublicDashboardPage";
import BlogsPage from "./pages/BlogsPage";
import BlogDetailPage from "./pages/BlogDetailPage";
import PublicDashboardPage from "./pages/PublicDashboardPage";
import { AdminRoute } from "./components/AdminRoute";
import { AdminLayout } from "./components/admin/AdminLayout";
import { useEffect } from "react";
import { PlatformChatbot } from "./components/PlatformChatbot";

// OpenAlgo ping temporarily disabled in mock-order mode to avoid CORS noise

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <PlatformChatbot />
          <Routes>
            <Route path="/rsb-fintech-founder" element={<LandingPage />} />
            <Route path="/dsn-fintech-founder" element={<LandingPage />} />
            <Route path="/" element={<Navigate to="/rsb-fintech-founder" replace />} />
            <Route path="/contact-us" element={<ContactUsPage />} />
            <Route path="/blogs" element={<BlogsPage />} />
            <Route path="/blogs/:slug" element={<BlogDetailPage />} />
            <Route path="/dashboard" element={<PublicDashboardPage />} />
            <Route path="/auth" element={<AuthPage />} />
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
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="predictions" element={<AdminPredictionsPage />} />
              <Route path="blogs" element={<AdminBlogsPage />} />
              <Route path="public-dashboard" element={<AdminPublicDashboardPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
