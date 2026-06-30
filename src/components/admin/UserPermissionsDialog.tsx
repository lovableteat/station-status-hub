import { useEffect, useMemo, useState } from "react";
import { Save, Shield, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_PAGE_PERMISSIONS,
  DEFAULT_WORKSPACE_ACCESS,
  LEGACY_PAGE_PERMISSION_GROUPS,
  type Permission,
  readWorkspaceAccess,
  type UserPermissionSettings,
  type WorkspaceAccessLevel,
  type WorkspaceAccessMap,
  type WorkspaceId,
  WORKSPACE_LABELS,
} from "@/lib/workspacePermissions";

interface UserPermissionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
}

const WORKSPACE_OPTIONS: Array<{
  value: WorkspaceAccessLevel;
  label: string;
  description: string;
}> = [
  { value: "none", label: "未授權", description: "不顯示此工作區" },
  { value: "view", label: "檢視", description: "可進入工作區，但不可編輯" },
  { value: "edit", label: "管理", description: "可完整操作此工作區" },
];

function getWorkspaceCardTone(level: WorkspaceAccessLevel) {
  switch (level) {
    case "edit":
      return "border-primary/35 bg-primary/10";
    case "view":
      return "border-sky-400/30 bg-sky-500/10";
    default:
      return "border-border bg-card";
  }
}

export function UserPermissionsDialog({
  isOpen,
  onClose,
  userId,
  username,
}: UserPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [workspaceAccess, setWorkspaceAccess] =
    useState<WorkspaceAccessMap>(DEFAULT_WORKSPACE_ACCESS);
  const [isLoading, setIsLoading] = useState(false);
  const [storedPermissionSettings, setStoredPermissionSettings] =
    useState<UserPermissionSettings>({});
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && userId) {
      loadUserPermissions();
    }
  }, [isOpen, userId]);

  const loadUserPermissions = async () => {
    try {
      const [{ data: pagePermissions, error: pagePermissionError }, { data: userData, error: userError }] =
        await Promise.all([
          supabase
            .from("user_page_permissions")
            .select("permission")
            .eq("user_id", userId),
          supabase
            .from("system_users")
            .select("permissions")
            .eq("id", userId)
            .maybeSingle(),
        ]);

      if (pagePermissionError) throw pagePermissionError;
      if (userError) throw userError;

      setPermissions(pagePermissions?.map((item) => item.permission as Permission) || []);

      const permissionSettings =
        userData?.permissions && typeof userData.permissions === "object"
          ? (userData.permissions as UserPermissionSettings)
          : {};

      setStoredPermissionSettings(permissionSettings);
      setWorkspaceAccess(readWorkspaceAccess(permissionSettings));
    } catch (error) {
      try {
        const localPermissions = localStorage.getItem(`user_page_permissions:${userId}`);
        const localWorkspace = localStorage.getItem(
          `user_workspace_permissions:${userId}`
        );

        setPermissions(localPermissions ? JSON.parse(localPermissions) : []);
        setWorkspaceAccess(readWorkspaceAccess(localWorkspace ? JSON.parse(localWorkspace) : null));
      } catch {
        setPermissions([]);
        setWorkspaceAccess(DEFAULT_WORKSPACE_ACCESS);
      }

      toast({
        title: "載入權限（離線）",
        description: "資料庫不可用，使用本機權限設定",
      });
    }
  };

  const handlePermissionChange = (permission: Permission, checked: boolean) => {
    if (checked) {
      setPermissions((prev) =>
        prev.includes(permission) ? prev : [...prev, permission]
      );
      return;
    }

    setPermissions((prev) => prev.filter((item) => item !== permission));
  };

  const handleWorkspaceLevelChange = (
    workspaceId: WorkspaceId,
    level: WorkspaceAccessLevel
  ) => {
    setWorkspaceAccess((prev) => ({
      ...prev,
      [workspaceId]: level,
    }));
  };

  const applyGlobalPreset = (level: WorkspaceAccessLevel) => {
    const nextWorkspaceAccess: WorkspaceAccessMap = {
      "station-status": level,
      "material-requests": level,
      "data-center": level,
    };

    setWorkspaceAccess(nextWorkspaceAccess);

    if (level === "edit") {
      setPermissions(ALL_PAGE_PERMISSIONS);
      return;
    }

    if (level === "view") {
      setPermissions(
        ALL_PAGE_PERMISSIONS.filter((permission) => permission.endsWith("_view"))
      );
      return;
    }

    setPermissions([]);
  };

  const workspaceSummary = useMemo(
    () =>
      Object.entries(WORKSPACE_LABELS).map(([workspaceId, label]) => ({
        id: workspaceId as WorkspaceId,
        label,
        level: workspaceAccess[workspaceId as WorkspaceId],
      })),
    [workspaceAccess]
  );

  const handleSave = async () => {
    try {
      setIsLoading(true);

      const nextPermissionSettings: UserPermissionSettings = {
        ...storedPermissionSettings,
        workspaceAccess,
      };

      const { error: deleteError } = await supabase
        .from("user_page_permissions")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;

      if (permissions.length > 0) {
        const { error: insertError } = await supabase
          .from("user_page_permissions")
          .insert(
            permissions.map((permission) => ({
              user_id: userId,
              permission: permission as any,
              granted_by: "admin",
            }))
          );
        if (insertError) throw insertError;
      }

      const { error: settingsError } = await supabase
        .from("system_users")
        .update({ permissions: nextPermissionSettings as any })
        .eq("id", userId);

      if (settingsError) throw settingsError;

      localStorage.setItem(
        `user_page_permissions:${userId}`,
        JSON.stringify(permissions)
      );
      localStorage.setItem(
        `user_workspace_permissions:${userId}`,
        JSON.stringify({ workspaceAccess })
      );

      toast({
        title: "設定成功",
        description: `已更新 ${username} 的工作區與頁面權限`,
      });

      onClose();
    } catch (error) {
      localStorage.setItem(
        `user_page_permissions:${userId}`,
        JSON.stringify(permissions)
      );
      localStorage.setItem(
        `user_workspace_permissions:${userId}`,
        JSON.stringify({ workspaceAccess })
      );

      toast({
        title: "已以本機方式儲存",
        description: "資料庫不可用，先保存至本機，稍後可再同步",
      });
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            設定 {username} 的網站權限
          </DialogTitle>
          <DialogDescription>
            先設定工作區權限，再視需要補細部頁面權限。工作區授權會直接影響登入後三大入口是否可見。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          <div className="rounded-2xl border border-primary/15 bg-background/40 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">快速套用</div>
                <div className="text-sm text-muted-foreground">
                  一鍵給整站檢視、整站管理，或直接清空所有授權。
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => applyGlobalPreset("view")}
                >
                  全站檢視
                </Button>
                <Button type="button" onClick={() => applyGlobalPreset("edit")}>
                  全站管理
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => applyGlobalPreset("none")}
                >
                  清空授權
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">工作區權限</h3>
              <p className="text-sm text-muted-foreground">
                這裡控制登入後三大入口。`管理` 代表此工作區內全部功能都能操作。
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {workspaceSummary.map((workspace) => (
                <div
                  key={workspace.id}
                  className={`rounded-2xl border p-4 ${getWorkspaceCardTone(
                    workspace.level
                  )}`}
                >
                  <div className="mb-4 space-y-1">
                    <div className="font-semibold text-foreground">{workspace.label}</div>
                    <div className="text-sm text-muted-foreground">
                      目前狀態：{WORKSPACE_OPTIONS.find((item) => item.value === workspace.level)?.label}
                    </div>
                  </div>

                  <RadioGroup
                    value={workspace.level}
                    onValueChange={(value) =>
                      handleWorkspaceLevelChange(
                        workspace.id,
                        value as WorkspaceAccessLevel
                      )
                    }
                    className="space-y-3"
                  >
                    {WORKSPACE_OPTIONS.map((option) => (
                      <div
                        key={`${workspace.id}-${option.value}`}
                        className="flex items-start gap-3 rounded-xl border border-border/60 p-3"
                      >
                        <RadioGroupItem
                          value={option.value}
                          id={`${workspace.id}-${option.value}`}
                          className="mt-1"
                        />
                        <Label
                          htmlFor={`${workspace.id}-${option.value}`}
                          className="flex-1 cursor-pointer space-y-1"
                        >
                          <div className="font-medium text-foreground">
                            {option.label}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {option.description}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">細部頁面權限</h3>
              <p className="text-sm text-muted-foreground">
                進階設定。若工作區已授權，這些細項會被視為補充控制；舊版 `資料中心` 權限仍保留相容。
              </p>
            </div>

            {Object.entries(LEGACY_PAGE_PERMISSION_GROUPS).map(([groupKey, group]) => (
              <div key={groupKey} className="space-y-3 rounded-2xl border p-4">
                <h4 className="font-semibold text-foreground">{group.name}</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.permissions.map((permission) => (
                    <div
                      key={permission.key}
                      className="flex items-center space-x-2 rounded-xl border border-border/60 p-3"
                    >
                      <Checkbox
                        id={permission.key}
                        checked={permissions.includes(permission.key)}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(
                            permission.key,
                            checked as boolean
                          )
                        }
                      />
                      <Label htmlFor={permission.key} className="text-sm">
                        {permission.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            <X className="mr-2 h-4 w-4" />
            取消
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "儲存中..." : "儲存權限"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
