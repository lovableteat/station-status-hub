import { useModuleNavigation } from "@/hooks/useModuleNavigation";
import { ModuleLoadRecovery } from "@/components/common/ModuleLoadRecovery";
import { recoverableLazy } from "@/components/common/recoverableLazy";
import { Suspense, useEffect, useState } from "react";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AppLoadingScreen } from "@/components/common/AppRuntimeBoundary";
import { TestProjectProvider } from "@/components/test-projects/TestProjectProvider";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { UnifiedDataProvider } from "@/hooks/useUnifiedData";
import { UserPresenceProvider } from "@/hooks/useUserPresence";

const Index = recoverableLazy(() => import("@/pages/Index"));
const NotFound = recoverableLazy(() => import("@/pages/NotFound"));
const TestTrackerPage = recoverableLazy(() => import("@/pages/TestTrackerPage"));
const ApiManagementPage = recoverableLazy(() =>
  import("@/components/api-management/ApiManagementPage").then((module) => ({
    default: module.ApiManagementPage,
  }))
);

const routeTarget = (pathname: string) => (pathname === "/" ? Index
  : pathname === "/test-tracker" ? TestTrackerPage
  : pathname === "/api-management" ? ApiManagementPage : NotFound);

/** How long the shell waits for its first page before it shows anyway (the page then appears through its own boundary). */
const SHELL_PREPARE_LIMIT_MS = 2500;

/**
 * Loads the page of the current route before the shell is first rendered, and lets that page start loading the
 * workspace named in the URL. Never rejects: a page that fails to load keeps its own retry screen when it is rendered.
 */
export function prepareAuthenticatedShell(): Promise<void> {
  const pathname = typeof window === "undefined" ? "/" : window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  const page = routeTarget(pathname).preload()
    .then((module) => { (module as { prepareInitialWorkspace?: () => void }).prepareInitialWorkspace?.(); })
    .catch(() => undefined);
  return Promise.race([page, new Promise<void>((resolve) => { setTimeout(resolve, SHELL_PREPARE_LIMIT_MS); })]);
}

function PreparedRoutes() {
  const location = useLocation();
  const routeTo = useNavigate();
  const [displayedLocation, setDisplayedLocation] = useState(location);
  const { navigate, pending, retry, cancel } = useModuleNavigation();
  useEffect(() => {
    if (location === displayedLocation) return;
    const target = routeTarget(location.pathname);
    void navigate(() => target.preload(), () => {
      if (location.pathname !== displayedLocation.pathname && !window.dispatchEvent(new Event("workspace-before-navigate", { cancelable: true }))) {
        routeTo(displayedLocation, { replace: true });
        return;
      }
      setDisplayedLocation(location);
    });
    return cancel;
  }, [location, displayedLocation, navigate, cancel, routeTo]);
  return <>
    {pending && <div role="status" className="p-3 text-sm">正在載入目標頁面，目前畫面仍可操作。</div>}
    {retry && <ModuleLoadRecovery onRetry={retry} onCancel={() => { cancel(); routeTo(displayedLocation, { replace: true }); }} />}
              <Suspense fallback={<AppLoadingScreen />}>
                <Routes location={displayedLocation}>
                  <Route path="/" element={<Index />} />
                  <Route
                    path="/test-tracker"
                    element={
                      <PermissionGuard modules={["test-tracker", "monitor"]}>
                        <TestTrackerPage />
                      </PermissionGuard>
                    }
                  />
                  <Route
                    path="/api-management"
                    element={
                      <PermissionGuard module="api-management">
                        <ApiManagementPage />
                      </PermissionGuard>
                    }
                  />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
  </>;
}

export default function AuthenticatedApplication() {
  return (
    <UserPresenceProvider>
      <PermissionsProvider>
        <TestProjectProvider>
          <UnifiedDataProvider>
            {/* Keep pre-v7 route update timing while retaining the existing dirty-work guards. */}
            <HashRouter useTransitions={false}>
              <PreparedRoutes />
            </HashRouter>
          </UnifiedDataProvider>
        </TestProjectProvider>
      </PermissionsProvider>
    </UserPresenceProvider>
  );
}
