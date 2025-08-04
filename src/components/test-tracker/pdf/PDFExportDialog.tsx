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
import { FileText, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TestSystem, TestStation, TestItem, TestProgress } from "../SystemStatusCalculator";
import { PDFProgressCalculator } from "./PDFProgressCalculator";
import { PDFReportGenerator } from "./PDFReportGenerator";

interface PDFExportDialogProps {
  systems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  isOpen: boolean;
  onClose: () => void;
}

export function PDFExportDialog({ 
  systems, 
  stations, 
  items, 
  progress, 
  isOpen, 
  onClose 
}: PDFExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // 計算系統數據
      const systemsData = PDFProgressCalculator.calculateSystemsData(
        systems, 
        stations, 
        items, 
        progress
      );
      
      // 計算統計數據
      const stats = PDFProgressCalculator.calculateStats(systemsData);
      
      // 生成HTML內容
      const htmlContent = PDFReportGenerator.generateHTML(systemsData, stats);
      
      // 開啟新視窗並列印
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // 等待內容載入後列印
        setTimeout(() => {
          printWindow.print();
        }, 1000);
        
        toast({
          title: "PDF 生成成功",
          description: "已開啟新視窗，請點擊列印或另存為 PDF",
        });
        
        onClose();
      } else {
        throw new Error("無法開啟新視窗，請檢查瀏覽器設定");
      }
      
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "PDF 生成失敗",
        description: error instanceof Error ? error.message : "未知錯誤",
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
            匯出 PDF 報告
          </DialogTitle>
          <DialogDescription>
            將當前的測試進度數據匯出為 PDF 格式報告
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">📋 報告內容預覽</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 測試統計總覽（完成率、進度分佈）</li>
              <li>• 系統詳細進度表（各站點進度）</li>
              <li>• 負責工程師分配情況</li>
              <li>• 開始/完成時間記錄</li>
              <li>• 系統統計包含狀態</li>
            </ul>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium mb-2 text-blue-900">📊 當前數據統計</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700">總系統數:</span>
                <span className="font-medium ml-2">{systems.length} 台</span>
              </div>
              <div>
                <span className="text-blue-700">已完成:</span>
                <span className="font-medium ml-2 text-green-600">
                  {systems.filter(s => s.status === '已完成').length} 台
                </span>
              </div>
              <div>
                <span className="text-blue-700">進行中:</span>
                <span className="font-medium ml-2 text-orange-600">
                  {systems.filter(s => s.status === '進行中').length} 台
                </span>
              </div>
              <div>
                <span className="text-blue-700">未開始:</span>
                <span className="font-medium ml-2 text-red-600">
                  {systems.filter(s => s.status === '未開始').length} 台
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                匯出 PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}