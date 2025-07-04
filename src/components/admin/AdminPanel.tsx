import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit, UserPlus, Shield, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";

interface Engineer {
  id: string;
  name: string;
  email: string;
  team: string;
  status: string;
  created_at: string;
}

export function AdminPanel() {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeam, setFilterTeam] = useState("all-teams");
  const [isEngineerDialogOpen, setIsEngineerDialogOpen] = useState(false);
  const [newEngineer, setNewEngineer] = useState({ name: "", email: "", team: "ME" });
  const { toast } = useToast();
  const { logout, user } = useUser();

  useEffect(() => {
    loadEngineers();
  }, []);

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

  const getTeamColor = (team: string) => {
    switch (team) {
      case 'ME': return 'bg-chart-1 text-primary-foreground';
      case 'BIOS/BMC': return 'bg-chart-2 text-success-foreground';
      case 'EE': return 'bg-chart-3 text-warning-foreground';
      case 'SIT/RAD': return 'bg-chart-4 text-danger-foreground';
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
        <div className="flex gap-2">
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
          
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            登出
          </Button>
        </div>
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
        <CardHeader>
          <CardTitle>工程師管理</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}