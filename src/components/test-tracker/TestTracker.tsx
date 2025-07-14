
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  Settings, 
  Download, 
  FileSpreadsheet, 
  Users, 
  Target, 
  ClipboardList,
  Database,
  Filter,
  RefreshCw,
  Eye,
  BarChart3
} from "lucide-react";

// Import existing components
import { TestProgressTable } from "./TestProgressTable";
import { SystemManager } from "./SystemManager";
import { FilterControls } from "./FilterControls";
import { ExportManager } from "./ExportManager";
import { FlowInfo } from "./FlowInfo";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";

export function TestTracker() {
  const { systems, stations, items, progress, loadData } = useTestTrackerData();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showSystemDialog, setShowSystemDialog] = useState(false);

  // Filter data based on search and status
  const filteredSystems = systems.filter(system => {
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         system.assigned_engineer?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || system.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRefresh = async () => {
    await loadData();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              GB300 L10 測試追蹤系統
            </h1>
            <p className="text-slate-400 mt-1">
              系統測試進度監控與管理平台
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              重新載入
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.open('/test-management', '_blank')}
              className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Settings className="h-4 w-4 mr-2" />
              流程管理
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">總系統數</p>
                  <p className="text-2xl font-bold text-white">{systems.length}</p>
                </div>
                <Database className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">已完成</p>
                  <p className="text-2xl font-bold text-green-400">
                    {systems.filter(s => s.status === 'Done').length}
                  </p>
                </div>
                <Target className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">進行中</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {systems.filter(s => s.status === 'On-going').length}
                  </p>
                </div>
                <ClipboardList className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">未開始</p>
                  <p className="text-2xl font-bold text-slate-400">
                    {systems.filter(s => s.status === 'Not Start').length}
                  </p>
                </div>
                <Users className="h-8 w-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="progress" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800 border-slate-700">
            <TabsTrigger 
              value="progress" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              測試進度
            </TabsTrigger>
            <TabsTrigger 
              value="systems" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300"
            >
              <Database className="h-4 w-4 mr-2" />
              系統管理
            </TabsTrigger>
            <TabsTrigger 
              value="export" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300"
            >
              <Download className="h-4 w-4 mr-2" />
              資料匯出
            </TabsTrigger>
            <TabsTrigger 
              value="flow" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300"
            >
              <Eye className="h-4 w-4 mr-2" />
              流程資訊
            </TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <CardTitle className="text-white">測試進度表</CardTitle>
                  
                  {/* Search and Filter Controls */}
                  <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-1 lg:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="搜尋系統名稱或工程師..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-400"
                      />
                    </div>
                    
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        <SelectItem value="all" className="text-white">全部狀態</SelectItem>
                        <SelectItem value="Not Start" className="text-white">未開始</SelectItem>
                        <SelectItem value="On-going" className="text-white">進行中</SelectItem>
                        <SelectItem value="Done" className="text-white">已完成</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <TestProgressTable 
                  systems={filteredSystems}
                  stations={stations}
                  items={items}
                  progress={progress}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="systems">
            <SystemManager />
          </TabsContent>

          <TabsContent value="export">
            <ExportManager />
          </TabsContent>

          <TabsContent value="flow">
            <FlowInfo />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
