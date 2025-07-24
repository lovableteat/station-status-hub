
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
      pdf.setFont("helvetica", "bold");
      
      // 設定顏色和樣式
      const primaryColor = [41, 128, 185]; // 藍色
      const secondaryColor = [52, 73, 94]; // 深灰色
      const lightGray = [245, 245, 245];
      
      // 添加標題背景
      pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.rect(15, 10, 267, 20, 'F');
      
      // 添加標題
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.text('GB300 L10 測試進度報表', 20, 25);
      
      // 添加副標題
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      pdf.setFontSize(10);
      pdf.text(`報表生成時間: ${new Date().toLocaleString('zh-TW')}`, 20, 40);
      pdf.text(`系統總數: ${systems.length} 台`, 20, 48);
      
      // 計算總體統計
      const completedSystems = systems.filter(s => s.overall_progress === 100).length;
      const inProgressSystems = systems.filter(s => s.overall_progress > 0 && s.overall_progress < 100).length;
      const notStartedSystems = systems.filter(s => s.overall_progress === 0).length;
      
      pdf.text(`已完成: ${completedSystems} 台 | 進行中: ${inProgressSystems} 台 | 未開始: ${notStartedSystems} 台`, 150, 40);
      pdf.text(`完成率: ${Math.round((completedSystems / systems.length) * 100)}%`, 150, 48);
      
      let yPosition = 65;
      
      // 重新設計的表格標頭（移除當前站點）
      const headers = [
        '機台編號', 
        '型號',
        '序號',
        '負責工程師',
        '整體進度',
        'Station 0\n工廠組裝',
        'Station 1\n開機',
        'Station 2\nFW',
        'Station 3\nPega_diag'
      ];
      
      const colWidths = [25, 20, 25, 25, 20, 25, 25, 25, 25];
      
      // 繪製表頭背景
      pdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      pdf.rect(15, yPosition - 8, colWidths.reduce((a, b) => a + b, 0), 16, 'F');
      
      // 繪製表頭文字
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      let currentX = 20;
      
      headers.forEach((header, index) => {
        const lines = header.split('\n');
        if (lines.length > 1) {
          pdf.text(lines[0], currentX, yPosition - 2);
          pdf.text(lines[1], currentX, yPosition + 4);
        } else {
          pdf.text(header, currentX, yPosition + 1);
        }
        currentX += colWidths[index];
      });
      
      yPosition += 12;
      
      // 繪製表頭下方分隔線
      pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.setLineWidth(0.5);
      pdf.line(15, yPosition, 15 + colWidths.reduce((a, b) => a + b, 0), yPosition);
      yPosition += 8;
      
      // 表格內容
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      
      systems.forEach((system, index) => {
        // 檢查是否需要新頁面
        if (yPosition > 180) {
          pdf.addPage();
          yPosition = 20;
          
          // 重新繪製標頁
          pdf.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
          pdf.rect(15, yPosition - 8, colWidths.reduce((a, b) => a + b, 0), 16, 'F');
          
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
          let headerX = 20;
          headers.forEach((header, headerIndex) => {
            const lines = header.split('\n');
            if (lines.length > 1) {
              pdf.text(lines[0], headerX, yPosition - 2);
              pdf.text(lines[1], headerX, yPosition + 4);
            } else {
              pdf.text(header, headerX, yPosition + 1);
            }
            headerX += colWidths[headerIndex];
          });
          
          yPosition += 12;
          pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          pdf.setLineWidth(0.5);
          pdf.line(15, yPosition, 15 + colWidths.reduce((a, b) => a + b, 0), yPosition);
          yPosition += 8;
          
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
        }
        
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
          system.system_name || '',
          system.model || '',
          system.serial_number || '',
          system.assigned_engineer || '',
          `${system.overall_progress}%`,
          getStationProgress(system.id, 0),
          getStationProgress(system.id, 1),
          getStationProgress(system.id, 2),
          getStationProgress(system.id, 3)
        ];
        
        // 交替行背景色
        if (index % 2 === 0) {
          pdf.setFillColor(250, 250, 250);
          pdf.rect(15, yPosition - 3, colWidths.reduce((a, b) => a + b, 0), 10, 'F');
        }
        
        // 根據進度設定文字顏色
        let rowX = 20;
        rowData.forEach((data, colIndex) => {
          if (colIndex === 4) { // 整體進度欄位
            const progress = parseInt(data);
            if (progress === 100) {
              pdf.setTextColor(46, 125, 50); // 綠色
            } else if (progress > 0) {
              pdf.setTextColor(255, 152, 0); // 橘色
            } else {
              pdf.setTextColor(244, 67, 54); // 紅色
            }
          } else if (colIndex >= 5) { // 站點進度欄位
            const progress = parseInt(data);
            if (progress === 100) {
              pdf.setTextColor(46, 125, 50); // 綠色
            } else if (progress > 0) {
              pdf.setTextColor(255, 152, 0); // 橘色
            } else {
            pdf.setTextColor(158, 158, 158); // 灰色
            }
          } else {
            pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
          }
          
          // 文字截斷處理
          let displayText = data;
          if (displayText.length > 12) {
            displayText = displayText.substring(0, 10) + '...';
          }
          
          pdf.text(displayText, rowX, yPosition);
          rowX += colWidths[colIndex];
        });
        
        yPosition += 10;
        
        // 每10行繪製一條淡色分隔線
        if ((index + 1) % 10 === 0) {
          pdf.setDrawColor(220, 220, 220);
          pdf.setLineWidth(0.1);
          pdf.line(15, yPosition, 15 + colWidths.reduce((a, b) => a + b, 0), yPosition);
          yPosition += 2;
        }
      });
      
      // 添加底部統計摘要框
      yPosition += 10;
      if (yPosition > 160) {
        pdf.addPage();
        yPosition = 20;
      }
      
      pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.rect(15, yPosition, 267, 25, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text('測試進度總結', 20, yPosition + 8);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`總系統數: ${systems.length}`, 20, yPosition + 16);
      pdf.text(`已完成: ${completedSystems} (${Math.round((completedSystems / systems.length) * 100)}%)`, 70, yPosition + 16);
      pdf.text(`進行中: ${inProgressSystems} (${Math.round((inProgressSystems / systems.length) * 100)}%)`, 150, yPosition + 16);
      pdf.text(`未開始: ${notStartedSystems} (${Math.round((notStartedSystems / systems.length) * 100)}%)`, 220, yPosition + 16);
      
      // 添加頁腳
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text(`第 ${i} 頁 / 共 ${pageCount} 頁`, 240, 190);
        pdf.text(`GB300 L10 測試追蹤系統`, 20, 190);
      }
      
      // 下載 PDF
      const fileName = `GB300_L10_測試進度報表_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.pdf`;
      pdf.save(fileName);
      
      toast({
        title: "匯出成功",
        description: "GB300 L10 測試進度報表已成功匯出",
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
