import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, UserPlus, Shield, LogOut, Users, Network, Clock3, Lock, UserCog, CircleHelp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/components/auth/UserContext";
import { ApiManagementPage } from "@/components/api-management/ApiManagementPage";
import { UserEditDialog } from "./UserEditDialog";
import { EngineerEditDialog } from "./EngineerEditDialog";
import { UserPermissionsDialog } from "./UserPermissionsDialog";
import {
  getWorkspaceLevelLabel,
  readWorkspaceAccess,
  WORKSPACE_LABELS,
} from "@/lib/workspacePermissions";

interface Engineer {
  id: string;
  name: string;
  email: string;
  team: string;
  status: string;
  created_at: string;
}

interface SystemUser {
  id: string;
  username: string;
  role: string;
  permissions: unknown;
  status: string;
  created_by: string;
  created_at: string;
  display_name?: string;
  password_hash?: string;
}

type AdminTab = "users" | "api-management";

const SHOW_ENGINEER_ADMIN = false;
const SHOW_EXTENDED_ADMIN_COPY = false;

export function AdminPanel({ initialTab = "users" }: { initialTab?: AdminTab }) {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeam, setFilterTeam] = useState("all-teams");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all-roles");
  const [userStatusFilter, setUserStatusFilter] = useState("all-status");
  const [isEngineerDialogOpen, setIsEngineerDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [newEngineer, setNewEngineer] = useState({ name: "", email: "", team: "ME" });
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "engineer", permissions: {}, displayName: "" });
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUsername, setSelectedUsername] = useState<string>("");
  const { toast } = useToast();
  const { logout, user } = useUser();
  const { canEditModule, canViewModule, loading: permissionsLoading } = usePermissions();
  const canEditUsers = canEditModule("users");
  const canViewApiManagement = canViewModule("api-management");

  useEffect(() => {
    if (permissionsLoading) return;
    setActiveTab(
      initialTab === "api-management" && !canViewApiManagement ? "users" : initialTab
    );
  }, [canViewApiManagement, initialTab, permissionsLoading]);

  const rejectUserMutation = () => {
    if (canEditUsers) return false;
    toast({
      title: "僅限檢視",
      description: "你的帳號沒有後台管理編輯權限。",
      variant: "destructive",
    });
    return true;
  };

  const loadEngineers = async () => {
    try {
      const { data, error } = await supabase
        .from('engineers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setEngineers(data);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入工程師資料",
        variant: "destructive"
      });
    }
  };

  const loadSystemUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setSystemUsers(data);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入系統用戶資料",
        variant: "destructive"
      });
    }
  }, [toast]);

  useEffect(() => {
    void loadSystemUsers();
  }, [loadSystemUsers]);

  const handleAddEngineer = async () => {
    try {
      const { error } = await supabase
        .from('engineers')
        .insert([newEngineer]);

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "工程師已成功新增"
      });

      setIsEngineerDialogOpen(false);
      setNewEngineer({ name: "", email: "", team: "ME" });
      loadEngineers();
    } catch (error) {
      toast({
        title: "新增失敗",
        description: "無法新增工程師",
        variant: "destructive"
      });
    }
  };

  const handleAddUser = async () => {
    if (rejectUserMutation()) return;

    if (!newUser.username || !newUser.password || !newUser.displayName) {
      toast({
        title: "新增失敗",
        description: "請填寫完整的用戶名、密碼和顯示名稱",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use the database function to hash the password
      const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
        password: newUser.password
      });
      
      if (hashError) {
        console.error('Hash password error:', hashError);
        throw new Error('密碼加密失敗');
      }

      const { error } = await supabase
        .from('system_users')
        .insert([{
          username: newUser.username,
          password_hash: hashedPassword,
          role: newUser.role,
          permissions: newUser.permissions,
          display_name: newUser.displayName,
          created_by: user?.username || 'admin'
        }]);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      toast({
        title: "新增成功",
        description: "系統用戶已成功新增"
      });

      setIsUserDialogOpen(false);
      setNewUser({ username: "", password: "", role: "engineer", permissions: {}, displayName: "" });
      loadSystemUsers();
    } catch (error: unknown) {
      console.error('Error adding user:', error);
      toast({
        title: "新增失敗",
        description: error instanceof Error ? error.message : "無法新增系統用戶",
        variant: "destructive"
      });
    }
  };

  const handleToggleEngineerStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('engineers')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "狀態更新成功",
        description: `工程師狀態已更新為${newStatus === 'active' ? '啟用' : '停用'}`
      });

      loadEngineers();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新工程師狀態",
        variant: "destructive"
      });
    }
  };

  const handleToggleUserStatus = async (id: string, currentStatus: string) => {
    if (rejectUserMutation()) return;

    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('system_users')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "狀態更新成功",
        description: `用戶狀態已更新為${newStatus === 'active' ? '啟用' : '停用'}`
      });

      loadSystemUsers();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新用戶狀態",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (rejectUserMutation()) return;

    try {
      const { error } = await supabase
        .from('system_users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "用戶已成功刪除"
      });

      loadSystemUsers();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除用戶",
        variant: "destructive"
      });
    }
  };

  const handleDeleteEngineer = async (engineerId: string) => {
    try {
      const { error } = await supabase
        .from('engineers')
        .delete()
        .eq('id', engineerId);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "工程師已成功刪除"
      });

      loadEngineers();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除工程師",
        variant: "destructive"
      });
    }
  };

  const getTeamColor = (team: string) => {
    switch (team) {
      case 'ME': return 'bg-chart-1 text-primary-foreground';
      case 'BIOS/BMC': return 'bg-chart-2 text-primary-foreground';
      case 'EE': return 'bg-chart-3 text-primary-foreground';
      case 'SIT/RAD': return 'bg-chart-4 text-primary-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'border-rose-200/45 bg-rose-300/18 text-rose-50';
      case 'admin': return 'border-amber-200/45 bg-amber-300/18 text-amber-50';
      case 'engineer': return 'border-sky-200/45 bg-sky-300/18 text-sky-50';
      default: return 'border-slate-200/22 bg-white/[0.05] text-slate-200';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "超級管理員";
      case "admin":
        return "管理員";
      case "engineer":
        return "工程師";
      default:
        return "檢視者";
    }
  };

  const getStatusLabel = (status: string) => (status === "active" ? "啟用" : "停用");

  const getStatusTone = (status: string) =>
    status === "active"
      ? "border-emerald-200/45 bg-emerald-300/18 text-emerald-50"
      : "border-slate-200/20 bg-slate-200/10 text-slate-300";

  const formatCreatedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "未提供";
    }

    return date.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getWorkspaceBadges = (permissionSettings: unknown) => {
    const workspaceAccess = readWorkspaceAccess(permissionSettings);

    return Object.entries(WORKSPACE_LABELS)
      .filter(([workspaceId]) => workspaceAccess[workspaceId as keyof typeof workspaceAccess] !== "none")
      .map(([workspaceId, label]) => ({
        id: workspaceId,
        label,
        level: getWorkspaceLevelLabel(
          workspaceAccess[workspaceId as keyof typeof workspaceAccess]
        ),
      }));
  };

  const isProtectedSystemUser = (systemUser: SystemUser) =>
    systemUser.username === "liu52417" ||
    systemUser.display_name === "管理員" ||
    systemUser.display_name === "Andy";

  const filteredEngineers = engineers.filter(engineer => {
    const matchesSearch = engineer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         engineer.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = filterTeam === "all-teams" || engineer.team === filterTeam;
    return matchesSearch && matchesTeam;
  });

  const filteredSystemUsers = systemUsers.filter((systemUser) => {
    const keyword = userSearchTerm.trim().toLowerCase();
    const workspaceBadges = getWorkspaceBadges(systemUser.permissions);
    const matchesSearch =
      keyword.length === 0 ||
      [
        systemUser.username,
        systemUser.display_name,
        systemUser.created_by,
        getRoleLabel(systemUser.role),
        ...workspaceBadges.map((workspace) => workspace.label),
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(keyword));

    const matchesRole =
      userRoleFilter === "all-roles" || systemUser.role === userRoleFilter;
    const matchesStatus =
      userStatusFilter === "all-status" || systemUser.status === userStatusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalUsers = systemUsers.length;
  const activeUsers = systemUsers.filter((item) => item.status === "active").length;
  const privilegedUsers = systemUsers.filter(
    (item) => item.role === "super_admin" || item.role === "admin"
  ).length;
  const workspaceConfiguredUsers = systemUsers.filter(
    (item) => getWorkspaceBadges(item.permissions).length > 0
  ).length;

  return (
    <div
      data-admin-surface="control-room"
      className="maintenance-workspace min-h-full w-full min-w-0 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.13),transparent_28%),radial-gradient(circle_at_86%_8%,rgba(59,130,246,0.12),transparent_24%),linear-gradient(180deg,#071827_0%,#06111f_42%,#081522_100%)] px-3 pb-3 pt-3 sm:px-4 lg:px-5"
    >
      <div className="flex min-h-full w-full min-w-0 flex-col gap-4">
        {/* Header */}
        <header
          data-admin-zone="command"
          className="relative overflow-hidden rounded-[14px] border border-cyan-200/40 bg-[linear-gradient(135deg,#173f5b_0%,#123149_52%,#153750_100%)] p-5 shadow-[0_22px_70px_-42px_rgba(56,189,248,0.85)] sm:p-6"
        >
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-px w-1/2 bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-cyan-200/20 bg-[linear-gradient(145deg,rgba(56,189,248,0.22),rgba(59,130,246,0.10))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_40px_-24px_rgba(56,189,248,0.9)]">
                <UserCog className="h-6 w-6 text-cyan-100" />
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">
                    Administration
                  </span>
                  <span className="h-1 w-1 rounded-full bg-cyan-300/60" />
                  <span className="text-xs text-slate-400">系統設定中心</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-[30px]">後台管理</h1>
                <p className="mt-1 text-sm text-slate-400">
                  歡迎回來，<span className="font-semibold text-slate-200">{user?.displayName || user?.username}</span>
                  <span className="mx-2 text-slate-600">/</span>超級管理員
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canViewApiManagement ? (
                <Button
                  variant="outline"
                  className="h-10 rounded-xl border-cyan-200/30 bg-[#0a2033]/80 text-slate-100 shadow-sm hover:border-cyan-100/55 hover:bg-cyan-300/15 hover:text-white"
                  onClick={() => setActiveTab("api-management")}
                >
                  <Network className="mr-2 h-4 w-4 text-cyan-200" />
                  API 管理
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="h-10 rounded-xl border-slate-200/20 bg-[#0a2033]/80 text-slate-200 shadow-sm hover:border-rose-300/35 hover:bg-rose-400/12 hover:text-rose-100"
                onClick={logout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                登出
              </Button>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdminTab)} className="flex flex-1 flex-col gap-4">
          <TabsList
            data-admin-zone="navigation"
            className={`grid h-auto w-full gap-1 rounded-xl border border-sky-200/30 bg-[#0d2437] p-1.5 shadow-[0_16px_36px_-28px_rgba(56,189,248,0.9)] ${canViewApiManagement ? "grid-cols-2 sm:w-[420px]" : "grid-cols-1 sm:w-[210px]"}`}
          >
            <TabsTrigger value="users" className="h-10 rounded-lg text-slate-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-300 data-[state=active]:to-sky-400 data-[state=active]:font-bold data-[state=active]:text-[#062033]">
            <Users className="h-4 w-4 mr-2" />
            用戶管理
          </TabsTrigger>
          {SHOW_ENGINEER_ADMIN ? <TabsTrigger value="engineers">
            <UserPlus className="h-4 w-4 mr-2" />
            工程師管理
          </TabsTrigger> : null}
          {canViewApiManagement ? (
            <TabsTrigger value="api-management" className="h-10 rounded-lg text-slate-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-300 data-[state=active]:to-sky-400 data-[state=active]:font-bold data-[state=active]:text-[#062033]">
              <Network className="h-4 w-4 mr-2" />
              API 管理
            </TabsTrigger>
          ) : null}
        </TabsList>

        {/* User Management Tab */}
        <TabsContent value="users" className="mt-0 flex flex-1 flex-col gap-3">
          <section className="flex flex-col gap-4 rounded-[14px] border border-sky-200/30 bg-[linear-gradient(120deg,#143852,#102b42)] px-5 py-4 shadow-[0_18px_48px_-38px_rgba(56,189,248,0.9)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-300/15 bg-sky-400/10">
                <Users className="h-4.5 w-4.5 text-sky-200" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-100">系統用戶管理</h2>
                <p className="mt-0.5 text-sm text-slate-400">管理帳號狀態、角色與各工作區存取權限</p>
              </div>
              {SHOW_EXTENDED_ADMIN_COPY ? <p className="max-w-3xl text-sm text-muted-foreground">
                這裡集中管理整站帳號、角色、工作區權限與細部頁面權限。密碼只會以雜湊方式保存，超級帳號可直接發起重設，但不能回看任何人的明文密碼。
              </p> : null}
            </div>

            <Dialog
              open={canEditUsers && isUserDialogOpen}
              onOpenChange={(open) => canEditUsers && setIsUserDialogOpen(open)}
            >
              <DialogTrigger asChild>
                <Button
                  disabled={!canEditUsers}
                  className="h-10 rounded-xl bg-gradient-to-r from-cyan-300 to-sky-400 px-4 font-bold text-slate-950 shadow-[0_12px_30px_-16px_rgba(56,189,248,0.95)] hover:from-cyan-200 hover:to-sky-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新增用戶
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl border border-[#356985] bg-[#10263a] text-slate-100">
                <DialogHeader>
                  <DialogTitle>新增系統用戶</DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="rounded-xl border border-cyan-300/20 bg-[#0d2137] p-4 text-sm text-slate-200">
                    新帳號建立時只輸入一次密碼，系統會立即轉成加密雜湊保存。若後續需要交接，請使用「編輯」直接重設新密碼。
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>用戶名</Label>
                      <Input
                        className="border-cyan-200/22 bg-white/[0.03] text-slate-50 placeholder:text-slate-400"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        placeholder="例如 vin、andy、pm_karen"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>顯示名稱</Label>
                      <Input
                        className="border-cyan-200/22 bg-white/[0.03] text-slate-50 placeholder:text-slate-400"
                        value={newUser.displayName}
                        onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                        placeholder="畫面上顯示的名稱"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>角色</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                      >
                        <SelectTrigger className="border-cyan-200/22 bg-white/[0.03] text-slate-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-cyan-200/22 bg-[#213152] text-slate-50">
                          {user?.role === "super_admin" ? (
                            <SelectItem value="super_admin">超級管理員</SelectItem>
                          ) : null}
                          <SelectItem value="admin">管理員</SelectItem>
                          <SelectItem value="engineer">工程師</SelectItem>
                          <SelectItem value="viewer">檢視者</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>初始密碼</Label>
                      <Input
                        className="border-cyan-200/22 bg-white/[0.03] text-slate-50 placeholder:text-slate-400"
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="建立後不會再顯示"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)} className="border-slate-200/18 bg-white/[0.03] text-slate-100 hover:border-cyan-200/35 hover:bg-cyan-300/10">
                      取消
                    </Button>
                    <Button onClick={handleAddUser}>建立帳號</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </section>

          <div data-admin-zone="status-overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="group relative overflow-hidden rounded-[14px] border-sky-300/35 bg-[linear-gradient(145deg,#173f5e,#102c45)] shadow-[0_18px_42px_-34px_rgba(56,189,248,0.9)]">
              <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />
              <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-200/65">全部帳號</div>
                  <div className="mt-1.5 text-[28px] font-bold leading-none text-slate-50">{totalUsers}</div>
                  <p className="mt-2 text-xs text-slate-400">後台可管理帳號總數</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/15 bg-sky-400/10">
                  <Users className="h-5 w-5 text-sky-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden rounded-[14px] border-emerald-300/35 bg-[linear-gradient(145deg,#12413f,#0d3035)] shadow-[0_18px_42px_-34px_rgba(52,211,153,0.8)]">
              <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
              <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-200/65">正常啟用</div>
                  <div className="mt-1.5 text-[28px] font-bold leading-none text-slate-50">{activeUsers}</div>
                  <p className="mt-2 text-xs text-slate-400">可以登入並操作</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-400/10">
                  <Shield className="h-5 w-5 text-emerald-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden rounded-[14px] border-amber-300/35 bg-[linear-gradient(145deg,#443b20,#27302e)] shadow-[0_18px_42px_-34px_rgba(251,191,36,0.75)]">
              <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
              <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/65">管理權限</div>
                  <div className="mt-1.5 text-[28px] font-bold leading-none text-slate-50">{privilegedUsers}</div>
                  <p className="mt-2 text-xs text-slate-400">具管理級權限帳號</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/15 bg-amber-400/10">
                  <UserCog className="h-5 w-5 text-amber-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden rounded-[14px] border-cyan-300/35 bg-[linear-gradient(145deg,#164255,#103047)] shadow-[0_18px_42px_-34px_rgba(34,211,238,0.8)]">
              <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
              <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">工作區權限</div>
                  <div className="mt-1.5 text-[28px] font-bold leading-none text-slate-50">{workspaceConfiguredUsers}</div>
                  <p className="mt-2 text-xs text-slate-400">已配置存取權限</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10">
                  <Lock className="h-5 w-5 text-cyan-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-admin-zone="filters" className="rounded-[14px] border-sky-200/30 bg-[#102b40] shadow-[0_18px_46px_-38px_rgba(56,189,248,0.85)]">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px]">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200/60" />
                  <Input
                    className="h-11 rounded-xl border-sky-200/20 bg-[#091d2e] pl-10 text-slate-100 shadow-none focus-visible:border-sky-300/55 focus-visible:ring-sky-300/20"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="搜尋帳號、顯示名稱、建立者或工作區"
                  />
                </div>

                <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                  <SelectTrigger className="h-11 rounded-xl border-sky-200/20 bg-[#091d2e] text-slate-100 shadow-none">
                    <SelectValue placeholder="角色" />
                  </SelectTrigger>
                  <SelectContent className="border-cyan-200/20 bg-[#213152] text-slate-50">
                    <SelectItem value="all-roles">全部角色</SelectItem>
                    <SelectItem value="super_admin">超級管理員</SelectItem>
                    <SelectItem value="admin">管理員</SelectItem>
                    <SelectItem value="engineer">工程師</SelectItem>
                    <SelectItem value="viewer">檢視者</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                  <SelectTrigger className="h-11 rounded-xl border-sky-200/20 bg-[#091d2e] text-slate-100 shadow-none">
                    <SelectValue placeholder="狀態" />
                  </SelectTrigger>
                  <SelectContent className="border-cyan-200/20 bg-[#213152] text-slate-50">
                    <SelectItem value="all-status">全部狀態</SelectItem>
                    <SelectItem value="active">啟用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-slate-500">
                <span>
                  顯示 <strong className="font-semibold text-sky-200">{filteredSystemUsers.length}</strong> / {totalUsers} 位用戶
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-emerald-300/70" />
                  密碼以加密雜湊保存，無法回看明文
                </span>
              </div>
            </CardContent>
          </Card>

          <Card data-admin-zone="accounts" className="flex min-h-[280px] flex-1 flex-col rounded-[14px] border-sky-200/30 bg-[#0c2235] shadow-[0_22px_60px_-48px_rgba(56,189,248,0.9)]">
            <CardContent className="flex flex-1 flex-col p-3 sm:p-4">
              <div className="flex-1 space-y-3">
                {filteredSystemUsers.map((systemUser) => {
                  const workspaceBadges = getWorkspaceBadges(systemUser.permissions);
                  const isProtected = isProtectedSystemUser(systemUser);

                  return (
                    <article
                      key={systemUser.id}
                      className="group relative overflow-hidden rounded-[14px] border border-sky-200/25 bg-[linear-gradient(135deg,#14354e,#102a40)] p-4 shadow-[0_16px_38px_-34px_rgba(56,189,248,0.75)] transition-all duration-200 hover:border-cyan-200/55 hover:bg-[linear-gradient(135deg,#173c57,#123149)] sm:p-5"
                    >
                      <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/15 bg-[linear-gradient(145deg,rgba(56,189,248,0.16),rgba(37,99,235,0.08))]">
                            <Shield className="h-4.5 w-4.5 text-sky-200" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-bold text-slate-100">
                                {systemUser.display_name || systemUser.username}
                              </h3>
                              <HoverCard openDelay={100} closeDelay={80}>
                                <HoverCardTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="帳號卡說明"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-slate-500 transition-colors hover:border-cyan-200/30 hover:text-cyan-100"
                                  >
                                    <CircleHelp className="h-3.5 w-3.5" />
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent
                                  align="start"
                                  className="w-72 border-cyan-200/20 bg-[#182a48] text-slate-100"
                                >
                                  <div className="space-y-2">
                                    <div className="text-sm font-semibold">帳號管理說明</div>
                                    <p className="text-sm leading-6 text-slate-300">
                                      卡片集中顯示建立資訊與工作區權限；停用、權限調整與密碼重設可從右側按鈕操作。
                                    </p>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                              <Badge className={getRoleColor(systemUser.role)}>{getRoleLabel(systemUser.role)}</Badge>
                              <Badge className={getStatusTone(systemUser.status)}>{getStatusLabel(systemUser.status)}</Badge>
                              {isProtected ? (
                                <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-slate-400">
                                  保留帳號
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">@{systemUser.username}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {systemUser.username !== "liu52417" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canEditUsers}
                              className="h-9 rounded-xl border-white/10 bg-slate-950/25 text-slate-300 hover:border-amber-300/20 hover:bg-amber-400/10 hover:text-amber-100"
                              onClick={() => handleToggleUserStatus(systemUser.id, systemUser.status)}
                            >
                              {systemUser.status === "active" ? "停用帳號" : "重新啟用"}
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" className="h-9 rounded-xl border-white/10 bg-slate-950/20" disabled>
                              主系統帳號
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canEditUsers}
                            className="h-9 rounded-xl border-sky-300/15 bg-sky-400/[0.07] text-sky-100 hover:border-sky-300/30 hover:bg-sky-400/15"
                            onClick={() => {
                              setSelectedUserId(systemUser.id);
                              setSelectedUsername(systemUser.username);
                              setPermissionsDialogOpen(true);
                            }}
                          >
                            <Shield className="mr-1.5 h-3.5 w-3.5" />
                            網站權限
                          </Button>

                          {canEditUsers ? (
                            <div className="[&>button]:h-9 [&>button]:rounded-xl [&>button]:border-white/10 [&>button]:bg-slate-950/25 [&>button]:text-slate-300 [&>button]:hover:border-sky-300/20 [&>button]:hover:bg-sky-400/10 [&>button]:hover:text-sky-100">
                              <UserEditDialog
                                userId={systemUser.id}
                                username={systemUser.username}
                                role={systemUser.role}
                                status={systemUser.status}
                                displayName={systemUser.display_name}
                                onUpdate={loadSystemUsers}
                                onDelete={handleDeleteUser}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 py-4 sm:grid-cols-3">
                        <div className="min-w-0 border-white/[0.07] sm:border-r sm:pr-4">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">登入帳號</div>
                          <div className="mt-1.5 truncate text-sm font-semibold text-slate-200">{systemUser.username}</div>
                        </div>
                        <div className="min-w-0 border-white/[0.07] sm:border-r sm:px-4">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">建立者</div>
                          <div className="mt-1.5 truncate text-sm font-semibold text-slate-200">{systemUser.created_by}</div>
                        </div>
                        <div className="min-w-0 sm:pl-4">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                            <Clock3 className="h-3 w-3" />
                            建立時間
                          </div>
                          <div className="mt-1.5 truncate text-sm font-semibold text-slate-200">
                            {formatCreatedAt(systemUser.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 rounded-xl border border-[#2a526f] bg-[#071522] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Lock className="h-3.5 w-3.5 text-cyan-200/75" />
                          <span className="text-xs font-semibold text-slate-400">網站與工作區權限</span>
                          <span className="rounded-full border border-white/[0.07] bg-white/[0.035] px-2 py-0.5 text-[10px] text-slate-500">
                            {workspaceBadges.length > 0 ? `${workspaceBadges.length} 個工作區` : "未配置"}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {workspaceBadges.length > 0 ? (
                            workspaceBadges.map((workspace) => (
                              <Badge
                                key={`${systemUser.id}-${workspace.id}`}
                                variant="outline"
                                className="border-cyan-300/10 bg-cyan-300/[0.05] text-[11px] font-medium text-cyan-100/80"
                              >
                                {workspace.label} · {workspace.level}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">尚未設定工作區權限</span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}

                {filteredSystemUsers.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-sky-300/15 bg-slate-950/20 px-6 py-16 text-center">
                    <div className="text-lg font-semibold text-slate-200">找不到符合條件的用戶</div>
                    <p className="mt-2 text-sm text-slate-500">
                      請調整搜尋關鍵字、角色或狀態篩選，再重新檢查。
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engineer Management Tab */}
        {SHOW_ENGINEER_ADMIN ? <TabsContent value="engineers" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">工程師管理</h2>
            <Dialog open={isEngineerDialogOpen} onOpenChange={setIsEngineerDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  新增工程師
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新增工程師</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>姓名</Label>
                    <Input 
                      value={newEngineer.name}
                      onChange={(e) => setNewEngineer({...newEngineer, name: e.target.value})}
                      placeholder="請輸入姓名..."
                    />
                  </div>
                  <div>
                    <Label>電子郵件</Label>
                    <Input 
                      value={newEngineer.email}
                      onChange={(e) => setNewEngineer({...newEngineer, email: e.target.value})}
                      placeholder="請輸入電子郵件..."
                    />
                  </div>
                  <div>
                    <Label>團隊</Label>
                    <Select value={newEngineer.team} onValueChange={(value) => setNewEngineer({...newEngineer, team: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ME">ME TEAM (第0站)</SelectItem>
                        <SelectItem value="BIOS/BMC">BIOS/BMC TEAM (第1站)</SelectItem>
                        <SelectItem value="EE">EE TEAM (第2站)</SelectItem>
                        <SelectItem value="SIT/RAD">SIT/RAD TEAM (第3站)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsEngineerDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleAddEngineer}>
                      新增
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="搜尋工程師姓名或郵件..."
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value.trim().slice(0, 100))}
                    />
                  </div>
                </div>
                <Select value={filterTeam} onValueChange={setFilterTeam}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="選擇團隊" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-teams">全部團隊</SelectItem>
                    <SelectItem value="ME">ME TEAM</SelectItem>
                    <SelectItem value="BIOS/BMC">BIOS/BMC TEAM</SelectItem>
                    <SelectItem value="EE">EE TEAM</SelectItem>
                    <SelectItem value="SIT/RAD">SIT/RAD TEAM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Engineers List */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {filteredEngineers.map((engineer) => (
                  <div key={engineer.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <UserPlus className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{engineer.name}</h3>
                        <p className="text-sm text-muted-foreground">{engineer.email}</p>
                      </div>
                      <Badge className={getTeamColor(engineer.team)}>
                        {engineer.team} TEAM
                      </Badge>
                      <Badge variant={engineer.status === 'active' ? 'default' : 'secondary'}>
                        {engineer.status === 'active' ? '啟用' : '停用'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleToggleEngineerStatus(engineer.id, engineer.status)}
                      >
                        {engineer.status === 'active' ? '停用' : '啟用'}
                      </Button>
                      <EngineerEditDialog
                        engineerId={engineer.id}
                        name={engineer.name}
                        email={engineer.email}
                        team={engineer.team}
                        status={engineer.status}
                        onUpdate={loadEngineers}
                        onDelete={handleDeleteEngineer}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent> : null}

        {canViewApiManagement ? (
          <TabsContent value="api-management" className="mt-0 flex-1">
            <ApiManagementPage />
          </TabsContent>
        ) : null}
      </Tabs>

      {/* User Permissions Dialog */}
      <UserPermissionsDialog
        isOpen={canEditUsers && permissionsDialogOpen}
        onClose={() => setPermissionsDialogOpen(false)}
        userId={selectedUserId}
        username={selectedUsername}
      />
      </div>
    </div>
  );
}
