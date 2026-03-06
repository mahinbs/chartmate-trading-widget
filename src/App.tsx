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
import AuthPage from "./pages/AuthPage";
import BrokerCallbackPage from "./pages/BrokerCallbackPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import ContactUsPage from "./pages/ContactUs";
import MarketPicksPage from "./pages/MarketPicksPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminPredictionsPage from "./pages/admin/AdminPredictionsPage";
import { AdminRoute } from "./components/AdminRoute";
import { useEffect } from "react";

// OpenAlgo ping temporarily disabled in mock-order mode to avoid CORS noise

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/rsb-fintech-founder" element={<LandingPage />} />
            <Route path="/dsn-fintech-founder" element={<LandingPage />} />
            <Route path="/" element={<Navigate to="/rsb-fintech-founder" replace />} />
            <Route path="/contact-us" element={<ContactUsPage />} />
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
              path="/market-picks"
              element={<MarketPicksPage />}
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/predictions"
              element={
                <AdminRoute>
                  <AdminPredictionsPage />
                </AdminRoute>
              }
            />
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
