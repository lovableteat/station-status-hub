import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Edit, UserPlus, Shield, LogOut, Users, Settings, Target, Network, Clock3, Lock, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  permissions: any;
  status: string;
  created_by: string;
  created_at: string;
  display_name?: string;
  password_hash?: string;
}

interface ProductionTarget {
  id: string;
  daily_target: number;
  weekly_target: number;
  target_date: string;
}

type AdminTab = "users" | "engineers" | "targets" | "api-management";

export function AdminPanel({ initialTab = "users" }: { initialTab?: AdminTab }) {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [productionTargets, setProductionTargets] = useState<ProductionTarget[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeam, setFilterTeam] = useState("all-teams");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all-roles");
  const [userStatusFilter, setUserStatusFilter] = useState("all-status");
  const [isEngineerDialogOpen, setIsEngineerDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [newEngineer, setNewEngineer] = useState({ name: "", email: "", team: "ME" });
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "engineer", permissions: {}, displayName: "" });
  const [newTarget, setNewTarget] = useState({ daily_target: 10, weekly_target: 50 });
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUsername, setSelectedUsername] = useState<string>("");
  const { toast } = useToast();
  const { logout, user } = useUser();

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadAllData = async () => {
    await Promise.all([loadEngineers(), loadSystemUsers(), loadProductionTargets()]);
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

  const loadSystemUsers = async () => {
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
  };

  const loadProductionTargets = async () => {
    try {
      const { data, error } = await supabase
        .from('production_targets')
        .select('*')
        .order('target_date', { ascending: false });

      if (error) throw error;
      if (data) setProductionTargets(data);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入生產目標資料",
        variant: "destructive"
      });
    }
  };

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
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast({
        title: "新增失敗",
        description: error.message || "無法新增系統用戶",
        variant: "destructive"
      });
    }
  };

  const handleUpdateTarget = async () => {
    try {
      let targetData = {
        ...newTarget,
        target_date: new Date().toISOString().split('T')[0]
      };

      if (editingTarget) {
        const { error } = await supabase
          .from('production_targets')
          .update(targetData)
          .eq('id', editingTarget);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('production_targets')
          .insert([targetData]);
        if (error) throw error;
      }

      toast({
        title: "更新成功",
        description: "生產目標已成功更新，儀表板將自動同步"
      });

      setIsTargetDialogOpen(false);
      setEditingTarget(null);
      setNewTarget({ daily_target: 10, weekly_target: 50 });
      loadProductionTargets();
      
      // Trigger dashboard refresh by dispatching custom event
      const event = new CustomEvent('dataUpdate', { detail: { type: 'production_targets' } });
      window.dispatchEvent(event);
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新生產目標",
        variant: "destructive"
      });
    }
  };

  const handleEditTarget = (target: ProductionTarget) => {
    setEditingTarget(target.id);
    setNewTarget({
      daily_target: target.daily_target,
      weekly_target: target.weekly_target
    });
    setIsTargetDialogOpen(true);
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
      case 'super_admin': return 'bg-red-500 text-white';
      case 'admin': return 'bg-orange-500 text-white';
      case 'engineer': return 'bg-blue-500 text-white';
      default: return 'bg-muted text-muted-foreground';
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
      ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-100"
      : "border-white/10 bg-secondary/70 text-muted-foreground";

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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">後台管理</h1>
          <p className="text-muted-foreground">歡迎，{user?.displayName || user?.username} (超級管理員)</p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setActiveTab("api-management")}>
          <Network className="h-4 w-4 mr-2" />
          API 管理
        </Button>
        <Button variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          登出
        </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdminTab)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            用戶管理
          </TabsTrigger>
          <TabsTrigger value="engineers">
            <UserPlus className="h-4 w-4 mr-2" />
            工程師管理
          </TabsTrigger>
          <TabsTrigger value="targets">
            <Target className="h-4 w-4 mr-2" />
            生產目標
          </TabsTrigger>
          <TabsTrigger value="api-management">
            <Network className="h-4 w-4 mr-2" />
            API 管理
          </TabsTrigger>
        </TabsList>

        {/* User Management Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">系統用戶管理</h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                這裡集中管理整站帳號、角色、工作區權限與細部頁面權限。密碼只會以雜湊方式保存，超級帳號可直接發起重設，但不能回看任何人的明文密碼。
              </p>
            </div>

            <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  新增用戶
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>新增系統用戶</DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4 text-sm text-muted-foreground">
                    新帳號建立時只輸入一次密碼，系統會立即轉成加密雜湊保存。若後續需要交接，請使用「編輯」直接重設新密碼。
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>用戶名</Label>
                      <Input
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        placeholder="例如 vin、andy、pm_karen"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>顯示名稱</Label>
                      <Input
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
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
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
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="建立後不會再顯示"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleAddUser}>建立帳號</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-primary/15 bg-primary/10">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Accounts</div>
                  <div className="mt-2 text-3xl font-semibold text-foreground">{totalUsers}</div>
                  <p className="mt-1 text-sm text-muted-foreground">目前後台可管理帳號總數</p>
                </div>
                <Users className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card className="border-emerald-400/15 bg-emerald-500/10">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Active</div>
                  <div className="mt-2 text-3xl font-semibold text-foreground">{activeUsers}</div>
                  <p className="mt-1 text-sm text-muted-foreground">目前可以登入並操作的帳號</p>
                </div>
                <Shield className="h-10 w-10 text-emerald-300" />
              </CardContent>
            </Card>

            <Card className="border-amber-400/15 bg-amber-500/10">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Privileged</div>
                  <div className="mt-2 text-3xl font-semibold text-foreground">{privilegedUsers}</div>
                  <p className="mt-1 text-sm text-muted-foreground">具管理級權限的帳號數量</p>
                </div>
                <UserCog className="h-10 w-10 text-amber-300" />
              </CardContent>
            </Card>

            <Card className="border-sky-400/15 bg-sky-500/10">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Workspace Access</div>
                  <div className="mt-2 text-3xl font-semibold text-foreground">{workspaceConfiguredUsers}</div>
                  <p className="mt-1 text-sm text-muted-foreground">已配置工作區入口與網站權限</p>
                </div>
                <Lock className="h-10 w-10 text-sky-300" />
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/85">
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-10"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="搜尋帳號、顯示名稱、建立者或工作區"
                  />
                </div>

                <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-roles">全部角色</SelectItem>
                    <SelectItem value="super_admin">超級管理員</SelectItem>
                    <SelectItem value="admin">管理員</SelectItem>
                    <SelectItem value="engineer">工程師</SelectItem>
                    <SelectItem value="viewer">檢視者</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="狀態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-status">全部狀態</SelectItem>
                    <SelectItem value="active">啟用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">顯示 {filteredSystemUsers.length} / {totalUsers} 位用戶</Badge>
                <Badge variant="outline">密碼保存方式：加密雜湊</Badge>
                <Badge variant="outline">明文回看：停用</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardContent className="pt-5">
              <div className="space-y-3">
                {filteredSystemUsers.map((systemUser) => {
                  const workspaceBadges = getWorkspaceBadges(systemUser.permissions);
                  const isProtected = isProtectedSystemUser(systemUser);

                  return (
                    <div
                      key={systemUser.id}
                      className="rounded-[24px] border border-border/70 bg-secondary/20 p-4 transition-colors hover:border-primary/30 hover:bg-secondary/30"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 flex-1 gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                            <Shield className="h-4.5 w-4.5 text-primary" />
                          </div>

                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-foreground">
                                {systemUser.display_name || systemUser.username}
                              </h3>
                              <Badge className={getRoleColor(systemUser.role)}>
                                {getRoleLabel(systemUser.role)}
                              </Badge>
                              <Badge className={getStatusTone(systemUser.status)}>
                                {getStatusLabel(systemUser.status)}
                              </Badge>
                              {isProtected ? <Badge variant="outline">保留帳號</Badge> : null}
                            </div>

                            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
                              <div className="rounded-2xl border border-border/60 bg-background/55 p-3">
                                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                                  帳號
                                </div>
                                <div className="mt-2 font-medium text-foreground">{systemUser.username}</div>
                              </div>

                              <div className="rounded-2xl border border-border/60 bg-background/55 p-3">
                                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                                  建立者
                                </div>
                                <div className="mt-2 font-medium text-foreground">{systemUser.created_by}</div>
                              </div>

                              <div className="rounded-2xl border border-border/60 bg-background/55 p-3">
                                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  建立時間
                                </div>
                                <div className="mt-2 font-medium text-foreground">
                                  {formatCreatedAt(systemUser.created_at)}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-foreground">網站與工作區權限</div>
                                  <div className="hidden text-sm text-muted-foreground">
                                    工作區入口與角色已合併顯示，超管可直接點右側按鈕調整。
                                  </div>
                                </div>
                                <Badge variant="outline">
                                  {workspaceBadges.length > 0 ? `${workspaceBadges.length} 個工作區` : "未配置"}
                                </Badge>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {workspaceBadges.length > 0 ? (
                                  workspaceBadges.map((workspace) => (
                                    <Badge key={`${systemUser.id}-${workspace.id}`} variant="outline">
                                      {workspace.label} · {workspace.level}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge variant="outline">尚未設定工作區權限</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="xl:w-[240px] xl:shrink-0">
                          <div className="space-y-2 rounded-[24px] border border-border/40 bg-background/20 p-3">
                            <div className="hidden rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Lock className="h-4 w-4 text-amber-300" />
                                密碼安全
                              </div>
                              <p className="mt-2 text-sm text-muted-foreground">
                                系統僅保存加密雜湊，不保存任何明文密碼。若需要交接或臨時登入，請直接按「編輯」重設新密碼。
                              </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                              {systemUser.username !== "liu52417" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleToggleUserStatus(systemUser.id, systemUser.status)
                                  }
                                >
                                  {systemUser.status === "active" ? "停用帳號" : "重新啟用"}
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" disabled>
                                  主系統帳號
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUserId(systemUser.id);
                                  setSelectedUsername(systemUser.username);
                                  setPermissionsDialogOpen(true);
                                }}
                              >
                                <Shield className="h-4 w-4 mr-1" />
                                網站權限
                              </Button>

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
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredSystemUsers.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-border/80 bg-background/35 px-6 py-16 text-center">
                    <div className="text-lg font-semibold text-foreground">找不到符合條件的用戶</div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      請調整搜尋關鍵字、角色或狀態篩選，再重新檢查。
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engineer Management Tab */}
        <TabsContent value="engineers" className="space-y-6">
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
        </TabsContent>

        {/* Production Targets Tab */}
        <TabsContent value="targets" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">生產目標設定</h2>
            <Dialog open={isTargetDialogOpen} onOpenChange={setIsTargetDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Settings className="h-4 w-4 mr-2" />
                  設定目標
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTarget ? "編輯生產目標" : "設定生產目標"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>每日目標 (台)</Label>
                    <Input 
                      type="number"
                      value={newTarget.daily_target}
                      onChange={(e) => setNewTarget({...newTarget, daily_target: parseInt(e.target.value) || 0})}
                      placeholder="請輸入每日目標..."
                    />
                  </div>
                  <div>
                    <Label>每週目標 (台)</Label>
                    <Input 
                      type="number"
                      value={newTarget.weekly_target}
                      onChange={(e) => setNewTarget({...newTarget, weekly_target: parseInt(e.target.value) || 0})}
                      placeholder="請輸入每週目標..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsTargetDialogOpen(false);
                      setEditingTarget(null);
                      setNewTarget({ daily_target: 10, weekly_target: 50 });
                    }}>
                      取消
                    </Button>
                    <Button onClick={handleUpdateTarget}>
                      {editingTarget ? "更新" : "新增"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {productionTargets.map((target) => (
                  <div key={target.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Target className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">目標日期: {target.target_date}</h3>
                        <p className="text-sm text-muted-foreground">
                          每日目標: {target.daily_target} 台 | 每週目標: {target.weekly_target} 台
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleEditTarget(target)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="api-management" className="space-y-6">
          <ApiManagementPage />
        </TabsContent>
      </Tabs>

      {/* User Permissions Dialog */}
      <UserPermissionsDialog
        isOpen={permissionsDialogOpen}
        onClose={() => setPermissionsDialogOpen(false)}
        userId={selectedUserId}
        username={selectedUsername}
      />
    </div>
  );
}
