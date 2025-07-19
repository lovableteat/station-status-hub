
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import "jspdf/dist/jspdf.es.min.js";
import { TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";

interface TestTrackerPDFExporterProps {
  systems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  isOpen: boolean;
  onClose: () => void;
}

export function TestTrackerPDFExporter({ 
  systems, 
  stations, 
  items, 
  progress, 
  isOpen, 
  onClose 
}: TestTrackerPDFExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const getProgressForSystemItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const calculateStationProgress = (systemId: string, stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const completedItems = stationItems.filter(item => {
      const prog = getProgressForSystemItem(systemId, stationId, item.id);
      return prog?.status === 'Done';
    });
    return stationItems.length > 0 
      ? Math.round((completedItems.length / stationItems.length) * 100) 
      : 0;
  };

  const exportPDF = async () => {
    try {
      setIsExporting(true);
      
      // 創建 PDF - 設定支援中文字體
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      // 設定字體（使用內建字體避免亂碼）
      pdf.setFont("times", "normal");
      
      // 添加標題
      pdf.setFontSize(20);
      pdf.text('GB300 L10 Test Progress Report', 20, 20);
      
      pdf.setFontSize(12);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
      pdf.text(`Total Systems: ${systems.length}`, 20, 40);
      
      let yPosition = 55;
      
      // 獲取 Station 0-3 的站點
      const targetStations = [
        { name: 'Station 0 - 工廠組裝', order: 0 },
        { name: 'Station 1 - 開機', order: 1 },
        { name: 'Station 2 - FW', order: 2 },
        { name: 'Station 3 - Pega_diag', order: 3 }
      ];
      
      // 表格標頭
      pdf.setFontSize(10);
      const headers = [
        'Machine No.', 
        'Current Station', 
        'Status',
        'Station 0 - Assembly',
        'Station 1 - Boot',
        'Station 2 - FW',
        'Station 3 - Pega_diag'
      ];
      
      const colWidths = [35, 30, 25, 45, 35, 30, 50];
      let currentX = 20;
      
      // 繪製表頭
      headers.forEach((header, index) => {
        pdf.text(header, currentX, yPosition);
        currentX += colWidths[index];
      });
      yPosition += 5;
      
      // 繪製分隔線
      pdf.line(20, yPosition, currentX - colWidths[colWidths.length - 1] + colWidths.reduce((a, b) => a + b, 0), yPosition);
      yPosition += 8;
      
      // 表格內容
      systems.forEach((system, index) => {
        // 檢查是否需要新頁面
        if (yPosition > 180) {
          pdf.addPage();
          yPosition = 20;
          
          // 重新繪製標頁
          pdf.setFontSize(10);
          let headerX = 20;
          headers.forEach((header, headerIndex) => {
            pdf.text(header, headerX, yPosition);
            headerX += colWidths[headerIndex];
          });
          yPosition += 5;
          pdf.line(20, yPosition, headerX - colWidths[colWidths.length - 1] + colWidths.reduce((a, b) => a + b, 0), yPosition);
          yPosition += 8;
        }
        
        // 計算系統狀態
        const getSystemStatus = (system: any) => {
          if (system.overall_progress === 100) return 'Completed';
          if (system.overall_progress > 0) return 'In Progress';
          return 'Not Started';
        };
        
        // 計算每個站點的進度
        const getStationProgress = (systemId: string, stationOrder: number) => {
          const station = stations.find(s => s.station_order === stationOrder);
          if (!station) return '0%';
          
          const stationItems = items.filter(item => item.station_id === station.id);
          if (stationItems.length === 0) return '0%';
          
          const completedItems = stationItems.filter(item => {
            const prog = progress.find(p => 
              p.system_id === systemId && 
              p.station_id === station.id && 
              p.item_id === item.id &&
              p.status === 'Done'
            );
            return prog;
          });
          
          const progressPercent = Math.round((completedItems.length / stationItems.length) * 100);
          return `${progressPercent}%`;
        };
        
        const rowData = [
          system.system_name,
          system.current_station || 'Not Set',
          getSystemStatus(system),
          getStationProgress(system.id, 0),
          getStationProgress(system.id, 1),
          getStationProgress(system.id, 2),
          getStationProgress(system.id, 3)
        ];
        
        let rowX = 20;
        rowData.forEach((data, colIndex) => {
          pdf.text(data, rowX, yPosition);
          rowX += colWidths[colIndex];
        });
        
        yPosition += 8;
        
        // 每5行繪製一條淡色分隔線
        if ((index + 1) % 5 === 0) {
          pdf.setDrawColor(200, 200, 200);
          pdf.line(20, yPosition, rowX - colWidths[colWidths.length - 1] + colWidths.reduce((a, b) => a + b, 0), yPosition);
          pdf.setDrawColor(0, 0, 0);
          yPosition += 2;
        }
      });
      
      // 添加頁腳
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.text(`Page ${i} of ${pageCount}`, 240, 190);
      }
      
      // 下載 PDF
      pdf.save(`GB300_L10_Test_Progress_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      
      toast({
        title: "匯出成功",
        description: "GB300 L10 測試進度報表已匯出為 PDF",
      });
      
      onClose();
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({
        title: "匯出失敗",
        description: "PDF 匯出過程中發生錯誤",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            測試追蹤 PDF 匯出
          </DialogTitle>
          <DialogDescription>
            匯出完整的 GB300 L10 測試追蹤報表，包含所有機台的測試進度。
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter>
          <Button
            onClick={exportPDF}
            disabled={isExporting}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "匯出中..." : "匯出完整 PDF 報表"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
