import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, BarChart3, Users } from "lucide-react";
import { TestProgressTable } from "./TestProgressTable";
import { ReportExporter } from "./ReportExporter";
import { useTestProgressData } from "@/hooks/useTestProgressData";

export function TestProgressReport() {
  const { progressData, statistics, isLoading, refetch } = useTestProgressData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showExcluded, setShowExcluded] = useState(false);

  // 過濾邏輯
  const filteredData = progressData.filter(item => {
    const matchesSearch = item.systemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.assignedEngineer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEngineer = filterEngineer === "all" || item.assignedEngineer === filterEngineer;
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    
    return matchesSearch && matchesEngineer && matchesStatus;
  });

  // 獲取工程師列表
  const engineers = [...new Set(progressData.map(item => item.assignedEngineer))];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">GB300 L10 測試進度報告</h1>
          <p className="text-muted-foreground">系統測試進度統計與詳細報表</p>
        </div>
        <ReportExporter data={filteredData} />
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總系統數</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.total}</div>
            <p className="text-xs text-muted-foreground">
              {showExcluded ? "包含排除項目" : "僅包含統計項目"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已完成</CardTitle>
            <Badge variant="default" className="bg-green-500">✓</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{statistics.completed}</div>
            <p className="text-xs text-muted-foreground">
              完成率 {statistics.completionRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">進行中</CardTitle>
            <Badge variant="default" className="bg-orange-500">◐</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{statistics.inProgress}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.total > 0 ? Math.round((statistics.inProgress / statistics.total) * 100) : 0}% 的系統
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">未開始</CardTitle>
            <Badge variant="destructive">○</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{statistics.notStarted}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.total > 0 ? Math.round((statistics.notStarted / statistics.total) * 100) : 0}% 的系統
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">工程師數</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{engineers.length}</div>
            <p className="text-xs text-muted-foreground">
              參與測試的工程師
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>搜尋與篩選</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="search">搜尋系統或工程師</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="輸入系統編號或工程師姓名"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>負責工程師</Label>
              <Select value={filterEngineer} onValueChange={setFilterEngineer}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇工程師" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有工程師</SelectItem>
                  {engineers.map(engineer => (
                    <SelectItem key={engineer} value={engineer}>
                      {engineer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>系統狀態</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有狀態</SelectItem>
                  <SelectItem value="已完成">已完成</SelectItem>
                  <SelectItem value="進行中">進行中</SelectItem>
                  <SelectItem value="未開始">未開始</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="show-excluded"
                checked={showExcluded}
                onCheckedChange={setShowExcluded}
              />
              <Label htmlFor="show-excluded">顯示排除項目</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Table */}
      <TestProgressTable data={filteredData} showExcluded={showExcluded} />

      {/* Summary Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground text-center">
            <p>顯示 {filteredData.length} / {progressData.length} 個系統</p>
            <p>最後更新: {new Date().toLocaleString('zh-TW')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}