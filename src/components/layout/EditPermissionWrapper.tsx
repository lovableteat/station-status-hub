import React from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface EditPermissionWrapperProps {
  children: React.ReactNode;
  module: string;
  fallback?: React.ReactNode;
}

export function EditPermissionWrapper({ 
  children, 
  module, 
  fallback = null 
}: EditPermissionWrapperProps) {
  const { canEditModule } = usePermissions();

  if (!canEditModule(module)) {
    return fallback;
  }

  return <>{children}</>;
}