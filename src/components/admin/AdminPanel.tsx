import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Edit, UserPlus, Shield, LogOut, Users, Settings, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";
import { UserEditDialog } from "./UserEditDialog";
import { EngineerEditDialog } from "./EngineerEditDialog";

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
}

interface ProductionTarget {
  id: string;
  daily_target: number;
  weekly_target: number;
  target_date: string;
}

export function AdminPanel() {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [productionTargets, setProductionTargets] = useState<ProductionTarget[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeam, setFilterTeam] = useState("all-teams");
  const [isEngineerDialogOpen, setIsEngineerDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [newEngineer, setNewEngineer] = useState({ name: "", email: "", team: "ME" });
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "engineer", permissions: {} });
  const [newTarget, setNewTarget] = useState({ daily_target: 10, weekly_target: 50 });
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const { toast } = useToast();
  const { logout, user } = useUser();

  useEffect(() => {
    loadAllData();
  }, []);

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
    if (!newUser.username || !newUser.password) {
      toast({
        title: "新增失敗",
        description: "請填寫完整的用戶名和密碼",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('system_users')
        .insert([{
          username: newUser.username,
          password_hash: newUser.password,
          role: newUser.role,
          permissions: newUser.permissions,
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
      setNewUser({ username: "", password: "", role: "engineer", permissions: {} });
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

  const filteredEngineers = engineers.filter(engineer => {
    const matchesSearch = engineer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         engineer.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = filterTeam === "all-teams" || engineer.team === filterTeam;
    return matchesSearch && matchesTeam;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">後台管理</h1>
          <p className="text-muted-foreground">歡迎，{user?.username} (超級管理員)</p>
        </div>
        <Button variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          登出
        </Button>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
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
        </TabsList>

        {/* User Management Tab */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">系統用戶管理</h2>
            <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  新增用戶
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新增系統用戶</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>用戶名</Label>
                    <Input 
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                      placeholder="請輸入用戶名..."
                    />
                  </div>
                  <div>
                    <Label>密碼</Label>
                    <Input 
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      placeholder="請輸入密碼..."
                    />
                  </div>
                  <div>
                    <Label>角色</Label>
                    <Select value={newUser.role} onValueChange={(value) => setNewUser({...newUser, role: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">管理員</SelectItem>
                        <SelectItem value="engineer">工程師</SelectItem>
                        <SelectItem value="viewer">檢視者</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleAddUser}>
                      新增
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {systemUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{user.username}</h3>
                        <p className="text-sm text-muted-foreground">建立者: {user.created_by}</p>
                      </div>
                      <Badge className={getRoleColor(user.role)}>
                        {user.role === 'super_admin' ? '超級管理員' : user.role === 'admin' ? '管理員' : user.role === 'engineer' ? '工程師' : '檢視者'}
                      </Badge>
                      <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                        {user.status === 'active' ? '啟用' : '停用'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      {user.username !== 'liu52417' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleToggleUserStatus(user.id, user.status)}
                      >
                        {user.status === 'active' ? '停用' : '啟用'}
                      </Button>
                    )}
                    <UserEditDialog
                      userId={user.id}
                      username={user.username}
                      role={user.role}
                      status={user.status}
                      onUpdate={loadSystemUsers}
                      onDelete={handleDeleteUser}
                    />
                    </div>
                  </div>
                ))}
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
                      onChange={(e) => setSearchTerm(e.target.value)}
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
      </Tabs>
    </div>
  );
}