import { useState, useEffect } from "react";
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";

export type Permission = 
  | 'dashboard_view' | 'dashboard_edit'
  | 'test_tracker_view' | 'test_tracker_edit'
  | 'l11_cabinet_view' | 'l11_cabinet_edit'
  | 'issues_view' | 'issues_edit'
  | 'production_view' | 'production_edit'
  | 'data_center_view' | 'data_center_edit'
  | 'tools_view' | 'tools_edit'
  | 'admin_view' | 'admin_edit'
  | 'comparison_view' | 'comparison_edit'
  | 'api_management_view' | 'api_management_edit';

export function usePermissions() {
  const { user } = useUser();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.userId) {
      loadUserPermissions();
    } else {
      setPermissions([]);
      setLoading(false);
    }
  }, [user?.userId]);

  const loadUserPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_page_permissions')
        .select('permission')
        .eq('user_id', user?.userId);

      if (error) throw error;
      setPermissions(data?.map(p => p.permission as Permission) || []);
    } catch (error) {
      console.error('Failed to load permissions:', error);
      // Fallback to localStorage so the app remains usable
      try {
        const local = localStorage.getItem(`user_page_permissions:${user?.userId}`);
        setPermissions(local ? JSON.parse(local) : []);
      } catch {
        setPermissions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    // 超級管理員和管理員有所有權限
    if (user?.role === 'super_admin' || user?.role === 'admin') {
      return true;
    }
    
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: Permission[]): boolean => {
    return permissionList.some(permission => hasPermission(permission));
  };

  const canViewModule = (module: string): boolean => {
    // 超級管理員和管理員有所有權限
    if (user?.role === 'super_admin' || user?.role === 'admin') {
      return true;
    }
    
    switch (module) {
      case 'dashboard':
        return hasPermission('dashboard_view');
      case 'l11-cabinet':
        return hasPermission('l11_cabinet_view');
      case 'test-tracker':
      case 'flow-info':
        return hasPermission('test_tracker_view');
      case 'issues':
        return hasPermission('issues_view');
      case 'monitor':
        return hasPermission('production_view');
      case 'data':
        return hasPermission('data_center_view');
      case 'tools':
        return hasPermission('tools_view');
      case 'bom-center':
        return hasPermission('comparison_view');
      case 'api-management':
        return hasPermission('api_management_view');
      case 'users':
        return hasPermission('admin_view');
      default:
        return false;
    }
  };

  const canEditModule = (module: string): boolean => {
    // 超級管理員和管理員有所有權限
    if (user?.role === 'super_admin' || user?.role === 'admin') {
      return true;
    }
    
    switch (module) {
      case 'dashboard':
        return hasPermission('dashboard_edit');
      case 'l11-cabinet':
        return hasPermission('l11_cabinet_edit');
      case 'test-tracker':
      case 'flow-info':
        return hasPermission('test_tracker_edit');
      case 'issues':
        return hasPermission('issues_edit');
      case 'monitor':
        return hasPermission('production_edit');
      case 'data':
        return hasPermission('data_center_edit');
      case 'tools':
        return hasPermission('tools_edit');
      case 'bom-center':
        return hasPermission('comparison_edit');
      case 'api-management':
        return hasPermission('api_management_edit');
      case 'users':
        return hasPermission('admin_edit');
      default:
        return false;
    }
  };

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    canViewModule,
    canEditModule
  };
}