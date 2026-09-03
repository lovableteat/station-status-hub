import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { watchPermissionRefresh } from "@/lib/permissionRefresh.mjs";
import {
  canAccessModule,
  type Permission,
  type UserPermissionSettings,
  type WorkspaceAccessMap,
  MODULE_WORKSPACE_MAP,
  readStoredPagePermissions,
  readWorkspaceAccess,
} from "@/lib/workspacePermissions";

interface PermissionsContextValue {
  permissions: Permission[];
  workspacePermissions: WorkspaceAccessMap;
  /** Whether an administrator explicitly assigned this account as a reviewer. */
  isPerformanceManager: boolean;
  loading: boolean;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  canViewModule: (module: string) => boolean;
  canEditModule: (module: string) => boolean;
  getWorkspaceAccess: (module: string) => "none" | "view" | "edit";
  reloadPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(
  undefined
);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionSettings, setPermissionSettings] =
    useState<UserPermissionSettings>({});
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [accountActive, setAccountActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const resetPermissions = useCallback(() => {
    setPermissions([]);
    setPermissionSettings({});
    setEffectiveRole(null);
    setAccountActive(false);
  }, []);

  const reloadPermissions = useCallback(async ({ background = false } = {}) => {
    const userId = user?.userId;
    const requestId = ++requestIdRef.current;

    if (!userId) {
      resetPermissions();
      setLoading(false);
      return;
    }

    if (import.meta.env.DEV && userId === "demo-admin") {
      setPermissions([]);
      setPermissionSettings({});
      setEffectiveRole("admin");
      setAccountActive(true);
      setLoading(false);
      return;
    }

    // Background revalidation must not unmount the assessment editor and
    // discard an employee's unsaved work.
    if (!background) setLoading(true);
    try {
      const [pagePermissionResult, userResult] = await Promise.all([
        supabase
          .from("user_page_permissions")
          .select("permission")
          .eq("user_id", userId),
        supabase
          .from("system_users")
          .select("permissions, role, status")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      if (userResult.error) throw userResult.error;
      if (!userResult.data) throw new Error("找不到目前登入帳號");
      if (requestId !== requestIdRef.current) return;

      const settings =
        userResult.data.permissions &&
        typeof userResult.data.permissions === "object" &&
        !Array.isArray(userResult.data.permissions)
          ? (userResult.data.permissions as UserPermissionSettings)
          : {};
      const storedPermissions = readStoredPagePermissions(settings);
      if (pagePermissionResult.error && storedPermissions === null) {
        throw pagePermissionResult.error;
      }

      setPermissions(
        storedPermissions ?? pagePermissionResult.data?.map(
          (item) => item.permission as Permission
        ) ?? []
      );
      setPermissionSettings(settings);
      setEffectiveRole(userResult.data.role);
      setAccountActive(userResult.data.status === "active");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to load current database permissions:", error);
      // Fail closed. A revoked permission must never be restored from stale browser storage.
      resetPermissions();
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [resetPermissions, user?.userId]);

  useEffect(() => {
    void reloadPermissions();
  }, [reloadPermissions]);

  useEffect(() => {
    const userId = user?.userId;
    if (!userId || (import.meta.env.DEV && userId === "demo-admin")) return;

    const handlePermissionUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) {
        void reloadPermissions({ background: true });
      }
    };
    window.addEventListener("station-permissions-updated", handlePermissionUpdate);
    const refresh = () => void reloadPermissions({ background: true });
    const stopRefresh = watchPermissionRefresh({
      windowTarget: window,
      documentTarget: document,
      refresh,
    });

    const channel = supabase
      .channel(`current-user-permissions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "workspace",
          table: "user_page_permissions",
          filter: `user_id=eq.${userId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "workspace",
          table: "system_users",
          filter: `id=eq.${userId}`,
        },
        refresh
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      stopRefresh();
      window.removeEventListener(
        "station-permissions-updated",
        handlePermissionUpdate
      );
      void supabase.removeChannel(channel);
    };
  }, [reloadPermissions, user?.userId]);

  const workspacePermissions = useMemo(
    () => readWorkspaceAccess(permissionSettings, permissions),
    [permissionSettings, permissions]
  );
  const isAdmin =
    accountActive &&
    (effectiveRole === "admin" || effectiveRole === "super_admin");
  const isPerformanceManager =
    isAdmin || permissionSettings.performanceManager === true;

  const hasPermission = useCallback(
    (permission: Permission) =>
      accountActive && (isAdmin || permissions.includes(permission)),
    [accountActive, isAdmin, permissions]
  );

  const hasAnyPermission = useCallback(
    (permissionList: Permission[]) =>
      permissionList.some((permission) => hasPermission(permission)),
    [hasPermission]
  );

  const canViewModule = useCallback(
    (module: string) =>
      accountActive &&
      canAccessModule({
        module,
        action: "view",
        role: effectiveRole,
        permissions,
        permissionSettings,
      }),
    [accountActive, effectiveRole, permissionSettings, permissions]
  );

  const canEditModule = useCallback(
    (module: string) =>
      accountActive &&
      canAccessModule({
        module,
        action: "edit",
        role: effectiveRole,
        permissions,
        permissionSettings,
      }),
    [accountActive, effectiveRole, permissionSettings, permissions]
  );

  const getWorkspaceAccess = useCallback(
    (module: string) => {
      if (isAdmin) return "edit" as const;
      const workspaceId = MODULE_WORKSPACE_MAP[module];
      return workspaceId ? workspacePermissions[workspaceId] : "none";
    },
    [isAdmin, workspacePermissions]
  );

  const value = useMemo<PermissionsContextValue>(
    () => ({
      permissions,
      workspacePermissions,
      isPerformanceManager,
      loading,
      hasPermission,
      hasAnyPermission,
      canViewModule,
      canEditModule,
      getWorkspaceAccess,
      reloadPermissions,
    }),
    [
      canEditModule,
      canViewModule,
      getWorkspaceAccess,
      hasAnyPermission,
      hasPermission,
      isPerformanceManager,
      loading,
      permissions,
      reloadPermissions,
      workspacePermissions,
    ]
  );

  return createElement(PermissionsContext.Provider, { value }, children);
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}
