
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
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
            total_systems: systems.length
          }
        });

      // Generate the actual report data
      const reportData = generateReportData();
      
      if (exportFormat === 'excel') {
        downloadAsExcel(reportData);
      } else if (exportFormat === 'pdf') {
        downloadAsPDF(reportData);
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
    let filteredSystems = systems;
    
    if (exportScope === 'completed') {
      filteredSystems = systems.filter(system => system.overall_progress === 100);
    } else if (exportScope === 'ongoing') {
      filteredSystems = systems.filter(system => system.overall_progress > 0 && system.overall_progress < 100);
    } else if (exportScope === 'pending') {
      filteredSystems = systems.filter(system => system.overall_progress === 0);
    }

    return filteredSystems.map(system => {
      // Calculate progress for each station
      const stationProgress = {};
      
      // Station 0 - 工廠組裝
      const station0Items = progress.filter(p => p.system_id === system.id && p.station_id === stations.find(s => s.station_order === 0)?.id);
      const station0Completed = station0Items.filter(p => p.status === 'Done').length;
      const station0Total = station0Items.length;
      stationProgress['Station 0 - 工廠組裝'] = station0Total > 0 ? Math.round((station0Completed / station0Total) * 100) + '%' : '0%';

      // Station 1 - 開機
      const station1Items = progress.filter(p => p.system_id === system.id && p.station_id === stations.find(s => s.station_order === 1)?.id);
      const station1Completed = station1Items.filter(p => p.status === 'Done').length;
      const station1Total = station1Items.length;
      stationProgress['Station 1 - 開機'] = station1Total > 0 ? Math.round((station1Completed / station1Total) * 100) + '%' : '0%';

      // Station 2 - FW
      const station2Items = progress.filter(p => p.system_id === system.id && p.station_id === stations.find(s => s.station_order === 2)?.id);
      const station2Completed = station2Items.filter(p => p.status === 'Done').length;
      const station2Total = station2Items.length;
      stationProgress['Station 2 - FW'] = station2Total > 0 ? Math.round((station2Completed / station2Total) * 100) + '%' : '0%';

      // Station 3 - Pega_diag
      const station3Items = progress.filter(p => p.system_id === system.id && p.station_id === stations.find(s => s.station_order === 3)?.id);
      const station3Completed = station3Items.filter(p => p.status === 'Done').length;
      const station3Total = station3Items.length;
      stationProgress['Station 3 - Pega_diag'] = station3Total > 0 ? Math.round((station3Completed / station3Total) * 100) + '%' : '0%';

      return {
        '機台編號': system.system_name,
        '當前站點': system.current_station || 'Station 0',
        '狀態': system.overall_progress === 100 ? '已完成' : 
               system.overall_progress >= 1 ? '進行中' : '未開始',
        'Station 0 - 工廠組裝': stationProgress['Station 0 - 工廠組裝'],
        'Station 1 - 開機': stationProgress['Station 1 - 開機'],
        'Station 2 - FW': stationProgress['Station 2 - FW'],
        'Station 3 - Pega_diag': stationProgress['Station 3 - Pega_diag']
      };
    });
  };

  const downloadAsExcel = (data: any[]) => {
    // Create CSV content for Excel
    let csvContent = "機台編號,當前站點,狀態,Station 0 - 工廠組裝,Station 1 - 開機,Station 2 - FW,Station 3 - Pega_diag\n";

    data.forEach(system => {
      const row = [
        system['機台編號'],
        system['當前站點'],
        system['狀態'],
        system['Station 0 - 工廠組裝'],
        system['Station 1 - 開機'],
        system['Station 2 - FW'],
        system['Station 3 - Pega_diag']
      ].join(',');
      csvContent += row + "\n";
    });

    // Add UTF-8 BOM for proper Excel display
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `GB300_L10_測試追蹤報表_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const downloadAsPDF = (data: any[]) => {
    let content = "L10 測試追蹤報表\n";
    content += `匯出時間: ${new Date().toLocaleString('zh-TW')}\n\n`;
    content += "機台編號\t當前站點\t狀態\tStation 0 - 工廠組裝\tStation 1 - 開機\tStation 2 - FW\tStation 3 - Pega_diag\n";
    
    data.forEach(system => {
      content += `${system['機台編號']}\t${system['當前站點']}\t${system['狀態']}\t${system['Station 0 - 工廠組裝']}\t${system['Station 1 - 開機']}\t${system['Station 2 - FW']}\t${system['Station 3 - Pega_diag']}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `GB300_L10_測試追蹤報表_${new Date().toISOString().split('T')[0]}.txt`;
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
          <DialogTitle>匯出 L10 測試追蹤報表</DialogTitle>
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
                    文字報表
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

          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              將匯出包含以下欄位的測試進度報表：
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>• 機台編號</li>
              <li>• 當前站點</li>
              <li>• 狀態（未開始/進行中/已完成）</li>
              <li>• Station 0 - 工廠組裝 進度</li>
              <li>• Station 1 - 開機 進度</li>
              <li>• Station 2 - FW 進度</li>
              <li>• Station 3 - Pega_diag 進度</li>
            </ul>
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
