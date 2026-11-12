import { recoverableLazy } from "@/components/common/recoverableLazy";
import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLoadingScreen } from "@/components/common/AppRuntimeBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "@/components/auth/LoginPage";
import { UserProvider, useUser } from "@/components/auth/UserContext";

const AuthenticatedApplication = recoverableLazy(() =>
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
  const { isInitializing, isLoggedIn, requiresRealtimeUpgrade, sessionRecoveryNeeded, retrySession, logout } = useUser();

  if (isInitializing) {
    return <AppLoadingScreen label="正在驗證安全工作階段" />;
  }

  if (sessionRecoveryNeeded) {
    return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8" role="status" aria-live="polite">
        <h1 className="text-xl font-semibold">正在恢復登入連線</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">網路或登入服務暫時沒有回應，系統會自動重試，不需要重填帳號密碼。</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={retrySession}>立即重試</button>
          <button className="min-h-11 rounded-lg border border-border px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={logout}>改用其他帳號</button>
        </div>
      </section>
    </main>;
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
