import { useEffect, useMemo, useState } from "react";
import { Save, Shield, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const enabledWorkspaceCount = useMemo(
    () => workspaceSummary.filter((workspace) => workspace.level !== "none").length,
    [workspaceSummary]
  );

  const editableWorkspaceCount = useMemo(
    () => workspaceSummary.filter((workspace) => workspace.level === "edit").length,
    [workspaceSummary]
  );

  const permissionPresetLabel = useMemo(() => {
    if (permissions.length === 0 && enabledWorkspaceCount === 0) {
      return "未授權";
    }

    if (
      editableWorkspaceCount === workspaceSummary.length &&
      permissions.length === ALL_PAGE_PERMISSIONS.length
    ) {
      return "全站管理";
    }

    if (
      enabledWorkspaceCount === workspaceSummary.length &&
      editableWorkspaceCount === 0 &&
      permissions.every((permission) => permission.endsWith("_view"))
    ) {
      return "全站檢視";
    }

    return "自訂配置";
  }, [editableWorkspaceCount, enabledWorkspaceCount, permissions, workspaceSummary.length]);

  const applyPermissionGroupPreset = (
    groupPermissions: Permission[],
    mode: "all" | "none"
  ) => {
    setPermissions((prev) => {
      if (mode === "none") {
        return prev.filter((permission) => !groupPermissions.includes(permission));
      }

      return Array.from(new Set([...prev, ...groupPermissions]));
    });
  };

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
      <DialogContent className="max-w-6xl overflow-hidden p-0">
        <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_28%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)/0.94))] px-6 py-5">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              設定 {username} 的網站權限
            </DialogTitle>
            <DialogDescription>
              先決定三大工作區是否可見，再補細部頁面權限。工作區是入口層，頁面權限是進入後的操作層。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4">
              <div className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Workspaces</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{enabledWorkspaceCount}</div>
              <p className="mt-1 text-sm text-muted-foreground">目前可見工作區</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4">
              <div className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Editable</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{editableWorkspaceCount}</div>
              <p className="mt-1 text-sm text-muted-foreground">可直接管理的工作區</p>
            </div>
            <div className="rounded-2xl border border-sky-400/15 bg-sky-500/10 p-4">
              <div className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Page Permissions</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{permissions.length}</div>
              <p className="mt-1 text-sm text-muted-foreground">已勾選的細部頁面權限</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/45 p-4">
              <div className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Preset</div>
              <div className="mt-2 text-xl font-semibold text-foreground">{permissionPresetLabel}</div>
              <p className="mt-1 text-sm text-muted-foreground">目前整體授權模式</p>
            </div>
          </div>
        </div>

        <div className="max-h-[76vh] overflow-y-auto px-6 py-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <section className="space-y-6">
              <div className="rounded-[28px] border border-border/70 bg-card/70 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-base font-semibold text-foreground">快速套用</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      一鍵切換成全站檢視、全站管理，或整筆清空授權。
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => applyGlobalPreset("view")}
                    >
                      全站檢視
                    </Button>
                    <Button
                      type="button"
                      onClick={() => applyGlobalPreset("edit")}
                    >
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    這裡決定登入後首頁會看見哪些工作區入口；選「管理」代表該工作區內所有功能都能操作。
                  </p>
                </div>

                <div className="grid gap-4">
                  {workspaceSummary.map((workspace) => (
                    <div
                      key={workspace.id}
                      className={`rounded-[28px] border p-5 ${getWorkspaceCardTone(workspace.level)}`}
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-lg font-semibold text-foreground">{workspace.label}</div>
                          <div className="text-sm text-muted-foreground">
                            目前狀態：{WORKSPACE_OPTIONS.find((item) => item.value === workspace.level)?.label}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {WORKSPACE_OPTIONS.find((item) => item.value === workspace.level)?.label}
                        </Badge>
                      </div>

                      <RadioGroup
                        value={workspace.level}
                        onValueChange={(value) =>
                          handleWorkspaceLevelChange(
                            workspace.id,
                            value as WorkspaceAccessLevel
                          )
                        }
                        className="grid gap-3 md:grid-cols-3"
                      >
                        {WORKSPACE_OPTIONS.map((option) => (
                          <div
                            key={`${workspace.id}-${option.value}`}
                            className={`rounded-2xl border p-4 transition-colors ${
                              workspace.level === option.value
                                ? "border-primary/45 bg-primary/10"
                                : "border-border/70 bg-background/50"
                            }`}
                          >
                            <div className="flex items-start gap-3">
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
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-[28px] border border-border/70 bg-card/70 p-5">
                <h3 className="text-lg font-semibold">細部頁面權限</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  進階控制用。若工作區已開放，這些權限決定進入後是只能看、可以編修，還是連管理設定也能操作。
                </p>
              </div>

              <div className="grid gap-4">
                {Object.entries(LEGACY_PAGE_PERMISSION_GROUPS).map(([groupKey, group]) => {
                  const groupPermissions = group.permissions.map((permission) => permission.key);
                  const selectedCount = groupPermissions.filter((permission) =>
                    permissions.includes(permission)
                  ).length;

                  return (
                    <div
                      key={groupKey}
                      className="rounded-[28px] border border-border/70 bg-card/70 p-5"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-foreground">{group.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            已選 {selectedCount} / {group.permissions.length} 項
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => applyPermissionGroupPreset(groupPermissions, "all")}
                          >
                            全選
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => applyPermissionGroupPreset(groupPermissions, "none")}
                          >
                            清空
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {group.permissions.map((permission) => {
                          const checked = permissions.includes(permission.key);

                          return (
                            <Label
                              key={permission.key}
                              htmlFor={permission.key}
                              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                                checked
                                  ? "border-primary/45 bg-primary/10"
                                  : "border-border/70 bg-background/50"
                              }`}
                            >
                              <Checkbox
                                id={permission.key}
                                checked={checked}
                                onCheckedChange={(checkedValue) =>
                                  handlePermissionChange(
                                    permission.key,
                                    checkedValue as boolean
                                  )
                                }
                                className="mt-1"
                              />
                              <div className="space-y-1">
                                <div className="font-medium text-foreground">
                                  {permission.label}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {permission.key.endsWith("_edit")
                                    ? "可編輯、更新或管理這個頁面的內容。"
                                    : "可查看此頁內容，但不允許修改。"}
                                </div>
                              </div>
                            </Label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/70 bg-card/95 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            儲存後會同時更新工作區入口權限與細部頁面授權。
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              <X className="mr-2 h-4 w-4" />
              取消
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? "儲存中..." : "儲存權限"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
