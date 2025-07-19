import React from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";

interface PermissionGuardProps {
  children: React.ReactNode;
  module?: string;
  requireEdit?: boolean;
  fallback?: React.ReactNode;
}

export function PermissionGuard({ 
  children, 
  module, 
  requireEdit = false, 
  fallback 
}: PermissionGuardProps) {
  const { canViewModule, canEditModule, loading } = usePermissions();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (module) {
    const hasViewAccess = canViewModule(module);
    const hasEditAccess = canEditModule(module);

    if (!hasViewAccess) {
      return fallback || (
        <Alert className="m-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            您沒有權限存取此頁面。請聯繫管理員獲取相應權限。
          </AlertDescription>
        </Alert>
      );
    }

    if (requireEdit && !hasEditAccess) {
      return fallback || (
        <Alert className="m-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            您只有檢視權限，無法編輯此頁面內容。
          </AlertDescription>
        </Alert>
      );
    }
  }

  return <>{children}</>;
}