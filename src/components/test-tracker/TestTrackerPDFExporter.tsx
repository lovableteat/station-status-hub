
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

  const generateStatsSection = (systems: TestSystem[]) => {
    const completedSystems = systems.filter(s => s.overall_progress === 100).length;
    const inProgressSystems = systems.filter(s => s.overall_progress > 0 && s.overall_progress < 100).length;
    const notStartedSystems = systems.filter(s => s.overall_progress === 0).length;
    
    return `
      <div class="stats">
        <h2>測試統計總覽</h2>
        <div style="display: flex; justify-content: space-around; text-align: center;">
          <div><strong>總系統數:</strong> ${systems.length} 台</div>
          <div class="progress-100"><strong>已完成:</strong> ${completedSystems} 台 (${Math.round((completedSystems / systems.length) * 100)}%)</div>
          <div class="progress-partial"><strong>進行中:</strong> ${inProgressSystems} 台 (${Math.round((inProgressSystems / systems.length) * 100)}%)</div>
          <div class="progress-zero"><strong>未開始:</strong> ${notStartedSystems} 台 (${Math.round((notStartedSystems / systems.length) * 100)}%)</div>
        </div>
      </div>
    `;
  };

  const generateTableSection = (systems: TestSystem[], stations: TestStation[], items: TestItem[], progress: TestProgress[]) => {
    const getStationProgress = (systemId: string, stationOrder: number) => {
      const system = systems.find(s => s.id === systemId);
      const station = stations.find(s => s.station_order === stationOrder);
      if (!station || !system) return 0;
      
      // 如果系統已完成，所有站點都應該顯示100%
      if (system.status === '已完成') {
        return 100;
      }
      
      const stationItems = items.filter(item => item.station_id === station.id);
      if (stationItems.length === 0) return 0;
      
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
      return progressPercent;
    };

    const getProgressClass = (percent: number) => {
      if (percent === 100) return 'progress-100';
      if (percent > 0) return 'progress-partial';
      return 'progress-zero';
    };

    const tableRows = systems.map(system => {
      const station0Progress = getStationProgress(system.id, 0);
      const station1Progress = getStationProgress(system.id, 1);
      const station2Progress = getStationProgress(system.id, 2);
      const station3Progress = getStationProgress(system.id, 3);
      
      return `
        <tr>
          <td style="text-align: left;">${system.system_name || ''}</td>
          <td>${system.model || ''}</td>
          <td>${system.serial_number || ''}</td>
          <td>${(system as any).bom_90 || ''}</td>
          <td>${system.assigned_engineer || ''}</td>
          <td class="${getProgressClass(system.overall_progress)}">${system.overall_progress}%</td>
          <td class="${getProgressClass(station0Progress)}">${station0Progress}%</td>
          <td class="${getProgressClass(station1Progress)}">${station1Progress}%</td>
          <td class="${getProgressClass(station2Progress)}">${station2Progress}%</td>
          <td class="${getProgressClass(station3Progress)}">${station3Progress}%</td>
        </tr>
      `;
    }).join('');

    return `
      <table>
        <thead>
          <tr>
            <th>機台編號</th>
            <th>型號</th>
            <th>序號</th>
            <th>90BOM</th>
            <th>負責工程師</th>
            <th>整體進度</th>
            <th>Station 0<br>工廠組裝</th>
            <th>Station 1<br>開機</th>
            <th>Station 2<br>FW</th>
            <th>Station 3<br>Pega_diag</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  };

  const exportPDF = async () => {
    try {
      setIsExporting(true);
      
      // 創建 HTML 內容避免亂碼
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>GB300 L10 測試進度報表</title>
          <style>
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
            body { 
              font-family: 'Microsoft JhengHei', 'Noto Sans TC', '微軟正黑體', Arial, sans-serif; 
              margin: 20px; 
              font-size: 14px;
              line-height: 1.4;
            }
            .header { 
              background: #2980b9; 
              color: white; 
              padding: 20px; 
              text-align: center; 
              margin-bottom: 20px;
              border-radius: 8px;
            }
            .header h1 { margin: 0 0 10px 0; font-size: 24px; }
            .header p { margin: 0; font-size: 16px; }
            .stats { 
              background: #ecf0f1; 
              padding: 15px; 
              margin-bottom: 20px; 
              border-radius: 8px;
            }
            .stats h2 { margin-top: 0; color: #2c3e50; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px; 
              font-size: 12px;
            }
            th, td { 
              border: 1px solid #ddd; 
              padding: 8px; 
              text-align: center; 
            }
            th { 
              background: #f8f9fa; 
              font-weight: bold; 
              color: #2c3e50;
            }
            .progress-100 { color: #28a745; font-weight: bold; }
            .progress-partial { color: #fd7e14; font-weight: bold; }
            .progress-zero { color: #dc3545; }
            tr:nth-child(even) { background-color: #f8f9fa; }
            .footer {
              margin-top: 30px; 
              text-align: center; 
              color: #666; 
              font-size: 12px;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GB300 L10 測試進度報表</h1>
            <p>報表生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          ${generateStatsSection(systems)}
          ${generateTableSection(systems, stations, items, progress)}
          
          <div class="footer">
            GB300 L10 測試追蹤系統 | 共 ${systems.length} 台機器
          </div>
          
          <div class="no-print" style="position: fixed; top: 20px; right: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #2980b9; color: white; border: none; border-radius: 4px; cursor: pointer;">列印 / 儲存為PDF</button>
            <button onclick="window.close()" style="padding: 10px 20px; background: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">關閉</button>
          </div>
        </body>
        </html>
      `;
      
      // 開新視窗並顯示報表
      const printWindow = window.open('', '_blank', 'width=1200,height=800');
      if (!printWindow) {
        throw new Error('無法開啟列印視窗，請檢查瀏覽器彈出視窗設定');
      }
      
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // 等待內容載入後自動列印
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
      
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
