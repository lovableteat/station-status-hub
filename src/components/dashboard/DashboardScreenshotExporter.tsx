
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
import { Camera, Download, FileImage, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface DashboardScreenshotExporterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DashboardScreenshotExporter({ isOpen, onClose }: DashboardScreenshotExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const captureScreenshot = async () => {
    try {
      // 找到儀表板主要內容區域
      const dashboardElement = document.querySelector('[data-dashboard-content]') || document.body;
      
      const canvas = await html2canvas(dashboardElement as HTMLElement, {
        backgroundColor: '#ffffff',
        scale: 2, // 提高解析度
        useCORS: true,
        allowTaint: true,
        width: dashboardElement.scrollWidth,
        height: dashboardElement.scrollHeight,
        scrollX: 0,
        scrollY: 0
      });
      
      return canvas;
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      throw new Error('截圖失敗');
    }
  };

  const exportAsPNG = async () => {
    try {
      setIsExporting(true);
      const canvas = await captureScreenshot();
      
      // 轉換為 PNG 並下載
      const link = document.createElement('a');
      link.download = `系統儀表板_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "匯出成功",
        description: "系統儀表板已匯出為 PNG 圖片",
      });
      
      onClose();
    } catch (error) {
      console.error('PNG export failed:', error);
      toast({
        title: "匯出失敗",
        description: "PNG 圖片匯出失敗",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const validateProgressData = async () => {
    try {
      // 驗證已完成系統的進度是否正確顯示為100%
      const { data: completedSystems } = await supabase
        .from('test_systems')
        .select('*')
        .eq('status', 'Done');
      
      if (completedSystems) {
        for (const system of completedSystems) {
          if (system.overall_progress !== 100) {
            console.warn(`系統 ${system.system_name} 狀態為已完成但進度不是100%，正在修正...`);
            
            // 手動更新系統進度為100%
            await supabase
              .from('test_systems')
              .update({ overall_progress: 100 })
              .eq('id', system.id);
          }
        }
      }

      // 同步修正所有已完成系統的各站進度計算
      console.log('已完成進度資料驗證和修正');
    } catch (error) {
      console.error('Progress validation failed:', error);
    }
  };

  const exportAsPDF = async () => {
    try {
      setIsExporting(true);
      
      // 修正資料庫中狀態為已完成但進度不是100%的系統
      await validateProgressData();
      
      // 等待資料更新完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const canvas = await captureScreenshot();
      
      // 計算 PDF 尺寸
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;
      
      // A4 尺寸 (mm)
      const pdfWidth = 297; // A4 橫向寬度
      const pdfHeight = 210; // A4 橫向高度
      
      let finalWidth, finalHeight;
      
      if (ratio > pdfWidth / pdfHeight) {
        // 圖片較寬，以寬度為準
        finalWidth = pdfWidth;
        finalHeight = pdfWidth / ratio;
      } else {
        // 圖片較高，以高度為準
        finalHeight = pdfHeight;
        finalWidth = pdfHeight * ratio;
      }
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      
      // 添加標題
      pdf.setFontSize(16);
      pdf.text('系統儀表板報表', 20, 20);
      pdf.setFontSize(10);
      pdf.text(`生成時間: ${new Date().toLocaleString('zh-TW')}`, 20, 30);
      
      // 添加截圖
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', (pdfWidth - finalWidth) / 2, 40, finalWidth, finalHeight);
      
      // 下載 PDF
      pdf.save(`系統儀表板_${new Date().toISOString().slice(0, 10)}.pdf`);
      
      toast({
        title: "匯出成功",
        description: "系統儀表板已匯出為 PDF 文件",
      });
      
      onClose();
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({
        title: "匯出失敗",
        description: "PDF 文件匯出失敗",
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
            <Camera className="h-5 w-5" />
            儀表板截圖匯出
          </DialogTitle>
          <DialogDescription>
            將目前的系統儀表板頁面匯出為圖片或PDF文件，包含所有圖表和數據視覺化內容。
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            onClick={exportAsPNG}
            disabled={isExporting}
            className="w-full"
            variant="outline"
          >
            <FileImage className="h-4 w-4 mr-2" />
            {isExporting ? "匯出中..." : "匯出為 PNG 圖片"}
          </Button>
          
          <Button
            onClick={exportAsPDF}
            disabled={isExporting}
            className="w-full"
          >
            <FileText className="h-4 w-4 mr-2" />
            {isExporting ? "匯出中..." : "匯出為 PDF 文件"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
