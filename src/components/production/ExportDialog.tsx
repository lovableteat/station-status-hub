import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, FileSpreadsheet, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generatePDF, generateExcel, downloadFile } from "@/utils/exportUtils";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data?: any[];
  stations?: any[];
  testItems?: any[];
  progress?: any[];
}

export function ExportDialog({ 
  open, 
  onOpenChange, 
  title, 
  data = [],
  stations = [],
  testItems = [],
  progress = []
}: ExportDialogProps) {
  const [exportFormat, setExportFormat] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    if (!exportFormat) {
      toast({
        title: "請選擇匯出格式",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);
    
    try {
      const fileName = `${title}_${new Date().toISOString().split('T')[0]}.${exportFormat}`;
      
      if (exportFormat === 'pdf') {
        await generatePDF(title, data);
        // PDF generation now handles the download directly
      } else {
        const excelBlob = await generateExcel(title, data, stations, testItems, progress);
        downloadFile(excelBlob, fileName);
      }
      
      toast({
        title: "匯出成功",
        description: `報表已匯出為 ${fileName}`
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "匯出失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>匯出 {title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>選擇匯出格式</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue placeholder="請選擇格式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF 格式
                  </div>
                </SelectItem>
                <SelectItem value="xlsx">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel 格式
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>將匯出 {data.length} 筆資料</p>
            <p>檔案名稱: {title}_{new Date().toISOString().split('T')[0]}.{exportFormat || 'xxx'}</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={!exportFormat || isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "匯出中..." : "開始匯出"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}