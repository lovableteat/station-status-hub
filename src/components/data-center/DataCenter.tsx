import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, FileText, FileSpreadsheet, Search } from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { useToast } from "@/hooks/use-toast";
import { CollapsibleTestRecords } from "./CollapsibleTestRecords";
import { PDFExportManager } from "./PDFExportManager";
import { TestProgressReport } from "@/components/reports/TestProgressReport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TestRecord {
  id: string;
  system_name: string;
  station_name: string;
  test_item: string;
  status: string;
  progress: number;
  assigned_engineer: string;
  start_date: string;
  completion_date?: string;
  notes?: string;
}

export function DataCenter() {
  const { systems, stations, testItems, progress, isLoading, refetch } = useUnifiedData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("all-engineers");
  const [filterStatus, setFilterStatus] = useState("all-status");
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const { toast } = useToast();

  // 監聽 systems 變化，當資料重置時自動重新載入
  useEffect(() => {
    const handleDataReset = () => {
      refetch();
    };

    // 監聽自定義事件
    window.addEventListener('dataReset', handleDataReset);
    
    return () => {
      window.removeEventListener('dataReset', handleDataReset);
    };
  }, [refetch]);

  // Convert unified data to test records format
  const generateRecords = (): TestRecord[] => {
    const records: TestRecord[] = [];
    
    progress.forEach(prog => {
      const system = systems.find(s => s.id === prog.system_id);
      const station = stations.find(s => s.id === prog.station_id);
      const item = testItems.find(i => i.id === prog.item_id);
      
      if (system && station && item) {
        // 修正進度計算 - 如果系統已完成且是 Station 0-3，則顯示 100%
        let displayProgress = prog.progress_percent;
        if (system.status === '已完成') {
          // 匹配station名稱中包含的關鍵字
          const stationName = station.station_name.toLowerCase();
          if (stationName.includes('station 0') || stationName.includes('工廠組裝') ||
              stationName.includes('station 1') || stationName.includes('開機') ||
              stationName.includes('station 2') || stationName.includes('fw') || stationName.includes('sft') ||
              stationName.includes('station 3') || stationName.includes('nv') || stationName.includes('diag')) {
            displayProgress = 100;
          }
        }

        records.push({
          id: prog.id,
          system_name: system.system_name,
          station_name: station.station_name,
          test_item: item.item_name,
          status: prog.status,
          progress: displayProgress,
          assigned_engineer: system.assigned_engineer || 'Unassigned',
          start_date: prog.started_at ? new Date(prog.started_at).toLocaleDateString('zh-TW', { 
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
          }) : '-',
          completion_date: prog.completed_at ? new Date(prog.completed_at).toLocaleDateString('zh-TW', { 
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
          }) : undefined,
          notes: prog.notes
        });
      }
    });
    
    return records;
  };

  const records = generateRecords();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-success text-success-foreground';
      case 'On-going': return 'bg-warning text-warning-foreground';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.test_item.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.assigned_engineer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEngineer = !filterEngineer || filterEngineer === "all-engineers" || record.assigned_engineer === filterEngineer;
    const matchesStatus = !filterStatus || filterStatus === "all-status" || record.status === filterStatus;
    
    let matchesDate = true;
    if (dateRange.from && dateRange.to) {
      const recordDate = new Date(record.start_date);
      matchesDate = recordDate >= dateRange.from && recordDate <= dateRange.to;
    }
    
    return matchesSearch && matchesEngineer && matchesStatus && matchesDate;
  });

  const engineers = [...new Set(records.map(r => r.assigned_engineer))];

  const exportToExcel = async () => {
    try {
      // Import the excel export function
      const { generateExcel, downloadFile } = await import('@/utils/exportUtils');
      
      // Generate Excel with test records data
      const excelBlob = await generateExcel(
        '測試記錄資料', 
        records.map(record => ({
          system_name: record.system_name,
          station_name: record.station_name,
          test_item: record.test_item,
          status: record.status,
          progress: record.progress,
          exclude_from_dashboard: systems.find(s => s.system_name === record.system_name)?.exclude_from_dashboard || false,
          assigned_engineer: record.assigned_engineer,
          start_date: record.start_date,
          completion_date: record.completion_date,
          notes: record.notes
        }))
      );
      
      const fileName = `測試記錄資料_${new Date().toISOString().split('T')[0]}.xlsx`;
      downloadFile(excelBlob, fileName);
      
      toast({
        title: "匯出成功",
        description: `已匯出 ${filteredRecords.length} 筆記錄到 Excel`,
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "匯出失敗",
        description: "Excel 匯出時發生錯誤",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">資料中心</h1>
          <p className="text-muted-foreground">測試記錄與報告查詢系統</p>
        </div>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="progress-report" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="progress-report">GB300 L10 測試進度報告</TabsTrigger>
          <TabsTrigger value="detailed-records">詳細測試記錄</TabsTrigger>
        </TabsList>
        
        <TabsContent value="progress-report" className="space-y-6">
          <TestProgressReport />
        </TabsContent>
        
        <TabsContent value="detailed-records" className="space-y-6">
          {/* Export Buttons */}
          <Card>
            <CardHeader>
              <CardTitle>資料匯出</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <PDFExportManager records={filteredRecords} />
                <Button variant="outline" onClick={exportToExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  匯出 Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>搜尋與篩選</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜尋系統、測項或工程師"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                
                <Select value={filterEngineer} onValueChange={setFilterEngineer}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇工程師" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-engineers">所有工程師</SelectItem>
                    {engineers.map(engineer => (
                      <SelectItem key={engineer} value={engineer}>
                        {engineer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇狀態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-status">所有狀態</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                    <SelectItem value="On-going">On-going</SelectItem>
                    <SelectItem value="Not Start">Not Start</SelectItem>
                  </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from && dateRange.to ? (
                        `${format(dateRange.from, "MM/dd", { locale: zhTW })} - ${format(dateRange.to, "MM/dd", { locale: zhTW })}`
                      ) : (
                        "選擇日期範圍"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Data Table - Collapsible by System */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                測試記錄表 - 依系統分組
                <Badge variant="outline" className="ml-auto">
                  {filteredRecords.length} 筆記錄
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredRecords.length > 0 ? (
                <CollapsibleTestRecords 
                  records={filteredRecords} 
                  getStatusColor={getStatusColor}
                />
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">沒有找到相關記錄</h3>
                  <p className="text-muted-foreground">請調整搜尋條件或選擇其他日期範圍</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}