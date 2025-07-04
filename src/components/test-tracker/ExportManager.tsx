import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileSpreadsheet, FileText, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportManagerProps {
  systems: any[];
  stations: any[];
  progress: any[];
}

export function ExportManager({ systems, stations, progress }: ExportManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [exportScope, setExportScope] = useState("all");
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const { toast } = useToast();

  const generateReport = async () => {
    try {
      // Log the export
      await supabase
        .from('test_export_logs')
        .insert({
          export_type: exportFormat,
          file_name: `test_report_${new Date().toISOString().split('T')[0]}.${exportFormat}`,
          exported_by: 'system_user',
          export_params: {
            scope: exportScope,
            include_details: includeDetails,
            include_notes: includeNotes,
            total_systems: systems.length
          }
        });

      // Generate the actual report data
      const reportData = generateReportData();
      
      if (exportFormat === 'excel') {
        downloadAsExcel(reportData);
      } else if (exportFormat === 'pdf') {
        downloadAsPDF(reportData);
      } else if (exportFormat === 'csv') {
        downloadAsCSV(reportData);
      }

      setIsDialogOpen(false);
      toast({
        title: "匯出成功",
        description: `報表已匯出為 ${exportFormat.toUpperCase()} 格式`
      });
    } catch (error) {
      toast({
        title: "匯出失敗",
        description: "無法匯出報表，請稍後再試",
        variant: "destructive"
      });
    }
  };

  const generateReportData = () => {
    const data = systems.map(system => {
      const systemProgress = stations.map(station => {
        const stationProgress = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        
        const completedItems = stationProgress.filter(p => p.status === 'Done').length;
        const totalItems = stationProgress.length;
        const stationPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
        
        return {
          station_name: station.station_name,
          progress: Math.round(stationPercent),
          completed_items: completedItems,
          total_items: totalItems,
          details: includeDetails ? stationProgress : []
        };
      });

      return {
        system_name: system.system_name,
        assigned_engineer: system.assigned_engineer,
        current_station: system.current_station,
        overall_progress: system.overall_progress,
        status: system.status,
        stations: systemProgress
      };
    });

    return data;
  };

  const downloadAsExcel = (data: any[]) => {
    // Create CSV content that can be opened by Excel
    let csvContent = "系統編號,負責工程師,當前站點,整體進度,狀態";
    
    // Add station headers
    stations.forEach(station => {
      csvContent += `,${station.station_name}進度`;
    });
    csvContent += "\n";

    // Add data rows
    data.forEach(system => {
      let row = `${system.system_name},${system.assigned_engineer},${system.current_station},${system.overall_progress}%,${system.status}`;
      
      system.stations.forEach((station: any) => {
        row += `,${station.progress}%`;
      });
      
      csvContent += row + "\n";
    });

    // Add UTF-8 BOM for proper Excel display
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `test_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const downloadAsCSV = (data: any[]) => {
    downloadAsExcel(data); // Same as Excel for now
  };

  const downloadAsPDF = (data: any[]) => {
    // For now, create a simple text report
    let content = "GB300 L10 測試報表\n";
    content += `匯出時間: ${new Date().toLocaleString('zh-TW')}\n\n`;
    
    data.forEach(system => {
      content += `系統: ${system.system_name}\n`;
      content += `負責工程師: ${system.assigned_engineer}\n`;
      content += `當前站點: ${system.current_station}\n`;
      content += `整體進度: ${system.overall_progress}%\n`;
      content += `狀態: ${system.status}\n`;
      content += "站點進度:\n";
      
      system.stations.forEach((station: any) => {
        content += `  ${station.station_name}: ${station.progress}% (${station.completed_items}/${station.total_items})\n`;
      });
      
      content += "\n";
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `test_report_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          匯出報表
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>匯出測試報表</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>匯出格式</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel (CSV)
                  </div>
                </SelectItem>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF (文字報表)
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    CSV
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>匯出範圍</Label>
            <Select value={exportScope} onValueChange={setExportScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部系統</SelectItem>
                <SelectItem value="completed">已完成系統</SelectItem>
                <SelectItem value="ongoing">進行中系統</SelectItem>
                <SelectItem value="pending">未開始系統</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>匯出選項</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="details" 
                  checked={includeDetails}
                  onCheckedChange={(checked) => setIncludeDetails(checked as boolean)}
                />
                <Label htmlFor="details">包含詳細進度資訊</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="notes" 
                  checked={includeNotes}
                  onCheckedChange={(checked) => setIncludeNotes(checked as boolean)}
                />
                <Label htmlFor="notes">包含測試備註</Label>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              將匯出 {systems.length} 個系統的測試進度報表，
              包含 {stations.length} 個測試站點的詳細資訊。
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={generateReport}>
              <Download className="h-4 w-4 mr-2" />
              開始匯出
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}