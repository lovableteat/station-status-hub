
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
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
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
      
      // 先截取現有的測試進度表
      const tableElement = document.querySelector('[data-testtracker-table]');
      let canvas = null;
      
      if (tableElement) {
        canvas = await html2canvas(tableElement as HTMLElement, {
          backgroundColor: '#ffffff',
          scale: 1.5,
          useCORS: true,
          allowTaint: true
        });
      }
      
      // 創建 PDF
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3' // 使用 A3 以容納更多內容
      });
      
      // 添加標題
      pdf.setFontSize(18);
      pdf.text('GB300 L10 測試追蹤報表', 20, 20);
      
      pdf.setFontSize(12);
      pdf.text(`生成時間: ${new Date().toLocaleString('zh-TW')}`, 20, 30);
      pdf.text(`總系統數: ${systems.length}`, 20, 40);
      
      let yPosition = 60;
      
      // 如果有截圖，先添加截圖
      if (canvas) {
        const imgWidth = 360; // A3 橫向可用寬度
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 20;
      }
      
      // 添加詳細數據表格
      const filteredStations = stations
        .filter(s => s.station_order >= 0 && s.station_order <= 4)
        .sort((a, b) => a.station_order - b.station_order);
      
      // 表格標題
      pdf.setFontSize(14);
      
      // 檢查是否需要新頁面
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;
      }
      
      pdf.text('詳細進度數據', 20, yPosition);
      yPosition += 15;
      
      // 表格標頭
      pdf.setFontSize(8);
      const headers = ['機台編號', '當前站點', '整體進度', ...filteredStations.map(s => s.station_name)];
      const colWidth = 45;
      const startX = 20;
      
      headers.forEach((header, index) => {
        pdf.text(header, startX + (index * colWidth), yPosition);
      });
      yPosition += 8;
      
      // 繪製分隔線
      pdf.line(startX, yPosition, startX + (headers.length * colWidth), yPosition);
      yPosition += 5;
      
      // 表格內容
      systems.forEach((system, index) => {
        // 檢查是否需要新頁面
        if (yPosition > 280) {
          pdf.addPage();
          yPosition = 20;
          
          // 重新繪製標頭
          pdf.setFontSize(8);
          headers.forEach((header, headerIndex) => {
            pdf.text(header, startX + (headerIndex * colWidth), yPosition);
          });
          yPosition += 8;
          pdf.line(startX, yPosition, startX + (headers.length * colWidth), yPosition);
          yPosition += 5;
        }
        
        const rowData = [
          system.system_name,
          system.current_station || '未設定',
          `${system.overall_progress || 0}%`,
          ...filteredStations.map(station => 
            `${calculateStationProgress(system.id, station.id)}%`
          )
        ];
        
        rowData.forEach((data, colIndex) => {
          pdf.text(data, startX + (colIndex * colWidth), yPosition);
        });
        
        yPosition += 8;
        
        // 每5行繪製一條淡色分隔線
        if ((index + 1) % 5 === 0) {
          pdf.setDrawColor(200, 200, 200);
          pdf.line(startX, yPosition, startX + (headers.length * colWidth), yPosition);
          pdf.setDrawColor(0, 0, 0);
          yPosition += 2;
        }
      });
      
      // 添加頁腳
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.text(`第 ${i} 頁，共 ${pageCount} 頁`, 350, 290);
      }
      
      // 下載 PDF
      pdf.save(`GB300_L10_測試追蹤報表_${new Date().toISOString().slice(0, 10)}.pdf`);
      
      toast({
        title: "匯出成功",
        description: "GB300 L10 測試追蹤報表已匯出為 PDF",
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
            匯出完整的 GB300 L10 測試追蹤報表，包含所有機台的測試進度和站點狀態圖表。
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
