import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppLoadingScreen } from "@/components/common/AppRuntimeBoundary";
import { TestProjectProvider } from "@/components/test-projects/TestProjectProvider";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { UnifiedDataProvider } from "@/hooks/useUnifiedData";
import { UserPresenceProvider } from "@/hooks/useUserPresence";

const Index = lazy(() => import("@/pages/Index"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const TestTrackerPage = lazy(() => import("@/pages/TestTrackerPage"));
const ApiManagementPage = lazy(() =>
  import("@/components/api-management/ApiManagementPage").then((module) => ({
    default: module.ApiManagementPage,
  }))
);

export default function AuthenticatedApplication() {
  return (
    <UserPresenceProvider>
      <PermissionsProvider>
        <TestProjectProvider>
          <UnifiedDataProvider>
            <HashRouter>
              <Suspense fallback={<AppLoadingScreen />}>
                <Routes>
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
            </HashRouter>
          </UnifiedDataProvider>
        </TestProjectProvider>
      </PermissionsProvider>
    </UserPresenceProvider>
  );
}
