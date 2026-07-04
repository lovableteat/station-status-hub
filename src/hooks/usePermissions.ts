import { useEffect, useState } from "react";
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import {
  type Permission,
  type WorkspaceAccessMap,
  MODULE_WORKSPACE_MAP,
  readWorkspaceAccess,
} from "@/lib/workspacePermissions";

export function usePermissions() {
  const { user } = useUser();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspaceAccessMap>(
    readWorkspaceAccess(null)
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.userId) {
      void loadUserPermissions();
      return;
    }

    setPermissions([]);
    setWorkspacePermissions(readWorkspaceAccess(null));
    setLoading(false);
  }, [user?.userId]);

  const loadUserPermissions = async () => {
    try {
      const [
        { data: pagePermissionData, error: pagePermissionError },
        { data: userData, error: userError },
      ] = await Promise.all([
        supabase
          .from("user_page_permissions")
          .select("permission")
          .eq("user_id", user?.userId),
        supabase
          .from("system_users")
          .select("permissions")
          .eq("id", user?.userId)
          .maybeSingle(),
      ]);

      if (pagePermissionError) throw pagePermissionError;
      if (userError) throw userError;

      setPermissions(pagePermissionData?.map((item) => item.permission as Permission) ?? []);
      setWorkspacePermissions(readWorkspaceAccess(userData?.permissions));
    } catch (error) {
      console.error("Failed to load permissions:", error);

      try {
        const localPermissions = localStorage.getItem(
          `user_page_permissions:${user?.userId}`
        );
        const localWorkspace = localStorage.getItem(
          `user_workspace_permissions:${user?.userId}`
        );

        setPermissions(localPermissions ? JSON.parse(localPermissions) : []);
        setWorkspacePermissions(
          readWorkspaceAccess(localWorkspace ? JSON.parse(localWorkspace) : null)
        );
      } catch {
        setPermissions([]);
        setWorkspacePermissions(readWorkspaceAccess(null));
      }
    } finally {
      setLoading(false);
    }
  };

  const isAdminUser = user?.role === "super_admin" || user?.role === "admin";

  const hasPermission = (permission: Permission): boolean => {
    if (isAdminUser) {
      return true;
    }

    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: Permission[]): boolean => {
    return permissionList.some((permission) => hasPermission(permission));
  };

  const getWorkspaceAccess = (module: string) => {
    const workspaceId = MODULE_WORKSPACE_MAP[module];
    if (!workspaceId) {
      return "none";
    }

    return workspacePermissions[workspaceId];
  };

  const canViewModule = (module: string): boolean => {
    if (isAdminUser) {
      return true;
    }

    const workspaceAccess = getWorkspaceAccess(module);
    if (workspaceAccess === "view" || workspaceAccess === "edit") {
      return true;
    }

    switch (module) {
      case "dashboard":
        return hasPermission("dashboard_view");
      case "test-tracker":
      case "flow-info":
        return hasPermission("test_tracker_view");
      case "issues":
        return hasPermission("issues_view");
      case "monitor":
        return hasPermission("production_view");
      case "data":
      case "material-requests":
        return hasPermission("data_center_view");
      case "tools":
        return hasPermission("tools_view");
      case "bom-center":
        return hasPermission("comparison_view");
      case "api-management":
        return hasPermission("api_management_view");
      case "users":
        return hasPermission("admin_view");
      default:
        return false;
    }
  };

  const canEditModule = (module: string): boolean => {
    if (isAdminUser) {
      return true;
    }

    if (getWorkspaceAccess(module) === "edit") {
      return true;
    }

    switch (module) {
      case "dashboard":
        return hasPermission("dashboard_edit");
      case "test-tracker":
      case "flow-info":
        return hasPermission("test_tracker_edit");
      case "issues":
        return hasPermission("issues_edit");
      case "monitor":
        return hasPermission("production_edit");
      case "data":
      case "material-requests":
        return hasPermission("data_center_edit");
      case "tools":
        return hasPermission("tools_edit");
      case "bom-center":
        return hasPermission("comparison_edit");
      case "api-management":
        return hasPermission("api_management_edit");
      case "users":
        return hasPermission("admin_edit");
      default:
        return false;
    }
  };

  return {
    permissions,
    workspacePermissions,
    loading,
    hasPermission,
    hasAnyPermission,
    canViewModule,
    canEditModule,
    getWorkspaceAccess,
  };
}
