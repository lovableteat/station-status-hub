import React from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/components/auth/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PermissionDebugInfo() {
  const { user } = useUser();
  const { permissions, loading, canViewModule, canEditModule } = usePermissions();

  if (loading) {
    return <div>載入權限中...</div>;
  }

  const modules = ['dashboard', 'test-tracker', 'issues', 'monitor', 'data', 'tools', 'users'];

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>權限偵錯資訊</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold">用戶資訊:</h4>
          <p>用戶ID: {user?.userId}</p>
          <p>用戶名: {user?.username}</p>
          <p>角色: {user?.role}</p>
        </div>
        
        <div>
          <h4 className="font-semibold">權限列表:</h4>
          <div className="flex flex-wrap gap-2">
            {permissions.map(permission => (
              <Badge key={permission} variant="outline">
                {permission}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold">模組權限:</h4>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {modules.map(module => (
              <div key={module} className="p-2 border rounded">
                <div className="font-medium">{module}</div>
                <div>檢視: {canViewModule(module) ? '✅' : '❌'}</div>
                <div>編輯: {canEditModule(module) ? '✅' : '❌'}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}