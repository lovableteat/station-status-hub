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

function PreparedRoutes() {
  const location = useLocation();
  const routeTo = useNavigate();
  const [displayedLocation, setDisplayedLocation] = useState(location);
  const { navigate, pending, retry, cancel } = useModuleNavigation();
  useEffect(() => {
    if (location === displayedLocation) return;
    const target = location.pathname === "/" ? Index
      : location.pathname === "/test-tracker" ? TestTrackerPage
      : location.pathname === "/api-management" ? ApiManagementPage : NotFound;
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
            <HashRouter>
              <PreparedRoutes />
            </HashRouter>
          </UnifiedDataProvider>
        </TestProjectProvider>
      </PermissionsProvider>
    </UserPresenceProvider>
  );
}
