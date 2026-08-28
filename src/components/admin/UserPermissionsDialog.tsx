import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { REALTIME_COLLABORATION_V2_ENABLED } from "@/lib/realtimeCollaborationConfig";
import {
  ALL_PAGE_PERMISSIONS,
  DEFAULT_WORKSPACE_ACCESS,
  LEGACY_PAGE_PERMISSION_GROUPS,
  type Permission,
  readWorkspaceAccess,
  synchronizeWorkspacePermissions,
  type UserPermissionSettings,
  type WorkspaceAccessLevel,
  type WorkspaceAccessMap,
  type WorkspaceId,
  WORKSPACE_IDS,
  WORKSPACE_LABELS,
} from "@/lib/workspacePermissions";
import { mutateAuthAccount } from "./authAccountSync";

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
  { value: "edit", label: "管理", description: "允許勾選的頁面進行編輯" },
];

const DETAIL_PERMISSION_SECTIONS: Array<{
  workspaceId: "station-status" | "user-management";
  title: string;
  description: string;
  groupKeys: string[];
}> = [
  {
    workspaceId: "station-status",
    title: "機台維修紀錄中心內頁",
    description: "控制儀表板、測試流程、產線、問題與工具等維修工作頁面。",
    groupKeys: ["dashboard", "test_tracker", "flow_info", "issues", "production", "tools"],
  },
  {
    workspaceId: "user-management",
    title: "後台管理內頁",
    description: "分開控制帳號與權限設定，以及 API 金鑰與服務設定。",
    groupKeys: ["admin", "api_management"],
  },
];

function getSaveErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }

  if (error instanceof Error && error.message) return error.message;

  return "資料庫未完成更新，原權限已完整保留，請稍後重試。";
}

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
  const { toast } = useToast();
  const { user } = useUser();

  const loadUserPermissions = useCallback(async () => {
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

      const loadedPermissions = pagePermissions?.map(
        (item) => item.permission as Permission,
      ) || [];
      setPermissions(loadedPermissions);

      const permissionSettings =
        userData?.permissions && typeof userData.permissions === "object"
          ? (userData.permissions as UserPermissionSettings)
          : {};

      setWorkspaceAccess(readWorkspaceAccess(permissionSettings, loadedPermissions));
    } catch (error) {
      console.error("Failed to load user permissions:", error);
      setPermissions([]);
      setWorkspaceAccess(DEFAULT_WORKSPACE_ACCESS);

      toast({
        title: "權限載入失敗",
        description: "無法讀取資料庫權限，請稍後重試。為避免誤設，未載入本機舊資料。",
        variant: "destructive",
      });
    }
  }, [toast, userId]);

  useEffect(() => {
    if (isOpen && userId) {
      void loadUserPermissions();
    }
  }, [isOpen, loadUserPermissions, userId]);

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
    setPermissions((prev) =>
      synchronizeWorkspacePermissions(prev, workspaceId, level)
    );
  };

  const applyGlobalPreset = (level: WorkspaceAccessLevel) => {
    const nextWorkspaceAccess = Object.fromEntries(
      WORKSPACE_IDS.map((workspaceId) => [workspaceId, level]),
    ) as WorkspaceAccessMap;

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
      const synchronizedPermissions = synchronizeWorkspacePermissions(
        permissions,
        "station-status",
        workspaceAccess["station-status"],
      );

      const currentRequest = {
        p_user_id: userId,
        p_permissions: synchronizedPermissions,
        p_workspace_access: workspaceAccess as unknown as Record<string, string>,
        p_granted_by: user?.username ?? "admin",
      };
      const { error } = await supabase.rpc(
        "set_user_access_permissions",
        currentRequest,
      );

      if (error) {
        // Older deployments may only recognize the original workspace keys.
        // Save the compatible subset first, then merge the complete settings
        // without replacing account-scoped drafts or other preferences.
        const legacyPermissions = synchronizedPermissions.filter(
          (permission) =>
            !permission.startsWith("pcb_designer_") &&
            !permission.startsWith("performance_"),
        );
        const legacyWorkspaceIds = new Set([
          "station-status",
          "material-requests",
          "data-center",
        ]);
        const legacyWorkspaceAccess = Object.fromEntries(
          Object.entries(workspaceAccess).filter(([workspaceId]) =>
            legacyWorkspaceIds.has(workspaceId),
          ),
        );
        const { error: legacyError } = await supabase.rpc(
          "set_user_access_permissions",
          {
            ...currentRequest,
            p_permissions: legacyPermissions,
            p_workspace_access: legacyWorkspaceAccess,
          },
        );
        if (legacyError) throw legacyError;

        const { data: account, error: accountError } = await supabase
          .from("system_users")
          .select("permissions")
          .eq("id", userId)
          .maybeSingle();
        if (accountError) throw accountError;

        const currentSettings = account?.permissions
          && typeof account.permissions === "object"
          && !Array.isArray(account.permissions)
          ? account.permissions as Record<string, unknown>
          : {};
        const mergedSettings = {
          ...currentSettings,
          workspaceAccess,
        };

        if (REALTIME_COLLABORATION_V2_ENABLED) {
          // The hosted database may still expose the earlier three-workspace
          // RPC. Its legacy save above is atomic for page permissions; this
          // verified Edge Function uses the service role to preserve the full
          // seven-workspace access map without weakening table policies.
          const accountSync = await mutateAuthAccount(userId, {
            action: "update",
            profile: { permissions: mergedSettings },
          });
          if (!accountSync.success) {
            throw new Error(accountSync.error || "工作區權限同步失敗");
          }
        } else {
          const { error: mergeError } = await supabase
            .from("system_users")
            .update({ permissions: mergedSettings })
            .eq("id", userId);
          if (mergeError) throw mergeError;
        }
      }

      window.dispatchEvent(
        new CustomEvent("station-permissions-updated", {
          detail: { userId },
        })
      );

      toast({
        title: "設定成功",
        description: `已更新 ${username} 的工作區與頁面權限`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "權限儲存失敗",
        description: getSaveErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        data-admin-dialog="permissions"
        data-permission-model="live-workspace-matrix"
        className="admin-permissions-dialog overflow-hidden border border-cyan-200/35 bg-[#081a2a] p-0 text-slate-100 shadow-[0_28px_100px_-45px_rgba(34,211,238,0.8)]"
      >
        <div className="admin-permissions-header border-b border-cyan-200/12 bg-[#0d2235] px-4 py-3 sm:px-5">
          <DialogHeader className="space-y-1 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              設定 {username} 的網站權限
            </DialogTitle>
            <DialogDescription className="admin-permissions-description">
              先設定工作區層級；只有維修中心與後台管理需要細分內頁權限。
            </DialogDescription>
          </DialogHeader>

          <div className="admin-permissions-toolbar mt-3">
            <div className="admin-permissions-stats" aria-label="目前權限摘要">
              <Badge variant="outline" className="border-sky-300/25 bg-sky-400/10 text-sky-100">
                {enabledWorkspaceCount}/{workspaceSummary.length} 工作區
              </Badge>
              <Badge variant="outline" className="border-emerald-300/25 bg-emerald-400/10 text-emerald-100">
                {editableWorkspaceCount} 可管理
              </Badge>
              <Badge variant="outline" className="border-cyan-300/25 bg-cyan-400/10 text-cyan-100">
                {permissions.length} 細部權限
              </Badge>
              <span className="admin-permissions-preset-label">{permissionPresetLabel}</span>
            </div>

            <div className="admin-permissions-presets" aria-label="快速套用">
              <span>快速套用</span>
              <Button type="button" variant="outline" size="sm" onClick={() => applyGlobalPreset("view")}>
                全站檢視
              </Button>
              <Button type="button" size="sm" onClick={() => applyGlobalPreset("edit")}>
                全站管理
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyGlobalPreset("none")}
                className="text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"
              >
                清空
              </Button>
            </div>
          </div>
        </div>

        <div className="admin-permissions-scroll min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="admin-permissions-layout grid gap-3">
            <section data-admin-zone="workspace-permissions" className="admin-permission-pane">
              <div className="admin-permission-pane-header">
                <div>
                  <h3>工作區權限</h3>
                  <p>七個入口直接設定為未授權、檢視或管理。</p>
                </div>
              </div>

              <div className="admin-permission-workspace-list">
                  {workspaceSummary.map((workspace) => (
                    <div
                      key={workspace.id}
                      className={`admin-permission-workspace-row ${getWorkspaceCardTone(workspace.level)}`}
                    >
                      <div className="admin-permission-workspace-name">
                        <strong>{workspace.label}</strong>
                        <span>{WORKSPACE_OPTIONS.find((item) => item.value === workspace.level)?.label}</span>
                      </div>

                      <RadioGroup
                        value={workspace.level}
                        onValueChange={(value) =>
                          handleWorkspaceLevelChange(
                            workspace.id,
                            value as WorkspaceAccessLevel
                          )
                        }
                        className="admin-permission-level-grid"
                      >
                        {WORKSPACE_OPTIONS.map((option) => (
                          <Label
                            key={`${workspace.id}-${option.value}`}
                            htmlFor={`${workspace.id}-${option.value}`}
                            title={option.description}
                            className={`admin-permission-level ${
                              workspace.level === option.value
                                ? "is-selected"
                                : ""
                            }`}
                          >
                            <RadioGroupItem
                              value={option.value}
                              id={`${workspace.id}-${option.value}`}
                              className="sr-only"
                            />
                            <span>{option.label}</span>
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
              </div>
            </section>

            <section data-admin-zone="page-permissions" className="admin-permission-pane">
              <div className="admin-permission-pane-header">
                <div>
                  <h3>細部頁面權限</h3>
                  <p>只列出維修中心與後台管理；工作區未授權時不展開。</p>
                </div>
              </div>

              <div className="admin-permission-storage-note">
                <Shield className="h-4 w-4" />
                <span>資料儲存權限會跟隨「機台維修紀錄中心」，不需重複設定。</span>
              </div>

              <div className="admin-permission-detail-list">
                {DETAIL_PERMISSION_SECTIONS.map((section) => {
                  const sectionLevel = workspaceAccess[section.workspaceId];

                  return (
                    <div key={section.workspaceId} className="admin-permission-detail-section">
                      <div className="admin-permission-detail-heading">
                        <div>
                          <h4>{section.title}</h4>
                          <p>{section.description}</p>
                        </div>
                        <Badge variant="outline">
                          {WORKSPACE_OPTIONS.find((item) => item.value === sectionLevel)?.label}
                        </Badge>
                      </div>

                      {sectionLevel === "none" ? (
                        <div className="admin-permission-detail-empty">
                          先在左側將此工作區設為「檢視」或「管理」。
                        </div>
                      ) : (
                        <div className="admin-permission-group-list">
                          {section.groupKeys
                            .map((groupKey) => [groupKey, LEGACY_PAGE_PERMISSION_GROUPS[groupKey]] as const)
                            .filter(([groupKey]) => groupKey !== "test_plan")
                            .map(([groupKey, group]) => {
                              const groupPermissions = group.permissions.map(
                                (permission) => permission.key,
                              );
                              const selectablePermissions = sectionLevel === "view"
                                ? groupPermissions.filter((permission) => permission.endsWith("_view"))
                                : groupPermissions;
                              const selectedCount = groupPermissions.filter((permission) =>
                                permissions.includes(permission),
                              ).length;

                              return (
                                <div key={groupKey} className="admin-permission-group-row">
                                  <div className="admin-permission-group-name">
                                    <strong>{group.name}</strong>
                                    <span>{selectedCount}/{group.permissions.length}</span>
                                  </div>

                                  <div className="admin-permission-group-shortcuts">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => applyPermissionGroupPreset(selectablePermissions, "all")}
                                    >
                                      全選
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => applyPermissionGroupPreset(groupPermissions, "none")}
                                    >
                                      清除
                                    </Button>
                                  </div>

                                  <div className="admin-permission-toggle-list">
                                    {group.permissions.map((permission) => {
                                      const checked = permissions.includes(permission.key);
                                      const isEditPermission = permission.key.endsWith("_edit");
                                      const disabled = isEditPermission && sectionLevel !== "edit";

                                      return (
                                        <Label
                                          key={permission.key}
                                          htmlFor={permission.key}
                                          title={permission.label}
                                          className={`admin-permission-toggle ${checked ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
                                        >
                                          <Checkbox
                                            id={permission.key}
                                            checked={checked}
                                            disabled={disabled}
                                            onCheckedChange={(checkedValue) =>
                                              handlePermissionChange(
                                                permission.key,
                                                checkedValue as boolean,
                                              )
                                            }
                                          />
                                          <span>{isEditPermission ? "管理" : "檢視"}</span>
                                        </Label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="admin-permissions-footer flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 px-4 py-3 sm:px-5">
          <div className="text-xs text-muted-foreground">
            儲存後立即更新工作區入口與細部頁面權限。
          </div>

          <div className="flex shrink-0 justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
              <X className="mr-2 h-4 w-4" />
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isLoading}>
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? "儲存中..." : "儲存權限"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
