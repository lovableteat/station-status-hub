import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "@/components/auth/UserContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import TestTrackerPage from "./pages/TestTrackerPage";
import SingleCabinetDisplayPage from "./pages/SingleCabinetDisplayPage";
import CabinetManagementPage from "./pages/CabinetManagementPage";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/test-tracker" element={<TestTrackerPage />} />
              <Route path="/cabinet-management" element={<CabinetManagementPage />} />
              <Route path="/cabinet/:cabinetId" element={<SingleCabinetDisplayPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </UserProvider>
    </QueryClientProvider>
  );
};

export default App;
