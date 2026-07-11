import React, { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLoadingScreen } from "@/components/common/AppRuntimeBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "@/components/auth/UserContext";
import { TestProjectProvider } from "@/components/test-projects/TestProjectProvider";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TestTrackerPage = lazy(() => import("./pages/TestTrackerPage"));
const ApiManagementPage = lazy(() =>
  import("@/components/api-management/ApiManagementPage").then((module) => ({
    default: module.ApiManagementPage,
  }))
);

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');

    window.__STATION_APP_READY__ = true;
    window.dispatchEvent(new Event("station-app-ready"));

    const recoveryTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem("station-status-hub:boot-retry");
        window.sessionStorage.removeItem("station-status-hub:chunk-retry");
        window.sessionStorage.removeItem("station-status-hub:html-revalidated");
      } catch {
        // The app remains usable when storage is unavailable.
      }
    }, 15_000);

    const clearRevalidationMarker = () => {
      try {
        window.sessionStorage.removeItem("station-status-hub:html-revalidated");
      } catch {
        // Ignore blocked storage while the page is closing.
      }
    };
    window.addEventListener("pagehide", clearRevalidationMarker);

    return () => {
      window.clearTimeout(recoveryTimer);
      window.removeEventListener("pagehide", clearRevalidationMarker);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <TestProjectProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
              <Suspense fallback={<AppLoadingScreen />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/test-tracker" element={<TestTrackerPage />} />
                  <Route path="/api-management" element={<ApiManagementPage />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </HashRouter>
          </TooltipProvider>
        </TestProjectProvider>
      </UserProvider>
    </QueryClientProvider>
  );
};

declare global {
  interface Window {
    __STATION_APP_READY__?: boolean;
  }
}

export default App;
