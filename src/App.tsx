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
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/auth" element={<AuthPage />} />
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
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
