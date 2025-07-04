import { useState, useEffect } from "react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, FileText, Calendar as CalendarIcon, Filter, Eye, FileImage, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { PDFExportManager } from "./PDFExportManager";
import { CollapsibleTestRecords } from "./CollapsibleTestRecords";

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
  const { systems, stations, testItems, progress, isLoading } = useUnifiedData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("all-engineers");
  const [filterStatus, setFilterStatus] = useState("all-status");
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const { toast } = useToast();

  // Convert unified data to test records format
  const generateRecords = (): TestRecord[] => {
    const records: TestRecord[] = [];
    
    progress.forEach(prog => {
      const system = systems.find(s => s.id === prog.system_id);
      const station = stations.find(s => s.id === prog.station_id);
      const item = testItems.find(i => i.id === prog.item_id);
      
      if (system && station && item) {
        records.push({
          id: prog.id,
          system_name: system.system_name,
          station_name: station.station_name,
          test_item: item.item_name,
          status: prog.status,
          progress: prog.progress_percent,
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

  const exportToPDF = () => {
    toast({
      title: "匯出 PDF",
      description: "PDF 匯出功能開發中...",
    });
  };

  const exportToExcel = () => {
    toast({
      title: "匯出 Excel",
      description: "Excel 匯出功能開發中...",
    });
  };

  const exportToImage = () => {
    toast({
      title: "匯出圖片",
      description: "圖片匯出功能開發中...",
    });
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
        <div className="flex gap-2">
          <PDFExportManager records={filteredRecords} />
          <Button variant="outline" onClick={exportToExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            匯出 Excel
          </Button>
          <Button variant="outline" onClick={exportToImage}>
            <FileImage className="h-4 w-4 mr-2" />
            匯出圖片
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜尋系統、測試項目或工程師..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <Select value={filterEngineer} onValueChange={setFilterEngineer}>
              <SelectTrigger>
                <SelectValue placeholder="選擇工程師" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-engineers">全部工程師</SelectItem>
                {engineers.map(engineer => (
                  <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="選擇狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-status">全部狀態</SelectItem>
                <SelectItem value="Done">已完成</SelectItem>
                <SelectItem value="On-going">進行中</SelectItem>
                <SelectItem value="Not Start">未開始</SelectItem>
              </SelectContent>
            </Select>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn(
                  "justify-start text-left font-normal",
                  !dateRange.from && !dateRange.to && "text-muted-foreground"
                )}>
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
    </div>
  );
}