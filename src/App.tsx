import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLoadingScreen } from "@/components/common/AppRuntimeBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "@/components/auth/LoginPage";
import { UserProvider, useUser } from "@/components/auth/UserContext";

const AuthenticatedApplication = lazy(() =>
  import("@/components/auth/AuthenticatedApplication")
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function ApplicationSessionGate() {
  const { isInitializing, isLoggedIn, requiresRealtimeUpgrade } = useUser();

  if (isInitializing) {
    return <AppLoadingScreen label="正在驗證安全工作階段" />;
  }

  if (requiresRealtimeUpgrade || !isLoggedIn) {
    return <LoginPage />;
  }

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <AuthenticatedApplication />
    </Suspense>
  );
}

const App = () => {
  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');

    window.__STATION_APP_READY__ = true;
    window.dispatchEvent(new Event("station-app-ready"));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ApplicationSessionGate />
        </TooltipProvider>
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
