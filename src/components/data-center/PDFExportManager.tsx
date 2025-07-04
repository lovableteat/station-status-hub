import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

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

interface PDFExportManagerProps {
  records: TestRecord[];
}

export function PDFExportManager({ records }: PDFExportManagerProps) {
  const { toast } = useToast();

  const generatePDF = () => {
    try {
      // Create a comprehensive HTML report
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>測試進度報告</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .status-done { color: green; font-weight: bold; }
            .status-ongoing { color: orange; font-weight: bold; }
            .status-notstart { color: red; font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GB300 L10 測試進度報告</h1>
            <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          <div class="summary">
            <h2>統計摘要</h2>
            <p>總測試項目: ${records.length}</p>
            <p>已完成: ${records.filter(r => r.status === 'Done').length}</p>
            <p>進行中: ${records.filter(r => r.status === 'On-going').length}</p>
            <p>未開始: ${records.filter(r => r.status === 'Not Start').length}</p>
            <p>完成率: ${Math.round((records.filter(r => r.status === 'Done').length / records.length) * 100)}%</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>系統編號</th>
                <th>測試站點</th>
                <th>測試項目</th>
                <th>狀態</th>
                <th>進度</th>
                <th>負責工程師</th>
                <th>開始日期</th>
                <th>完成日期</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(record => `
                <tr>
                  <td>${record.system_name}</td>
                  <td>${record.station_name}</td>
                  <td>${record.test_item}</td>
                  <td class="status-${record.status.toLowerCase().replace(' ', '')}">${record.status}</td>
                  <td>${record.progress}%</td>
                  <td>${record.assigned_engineer}</td>
                  <td>${record.start_date}</td>
                  <td>${record.completion_date || '-'}</td>
                  <td>${record.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p>此報告由 GB300 L10 測試管理系統自動生成</p>
          </div>
        </body>
        </html>
      `;

      // Create a new window and write the HTML content
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Wait for content to load then print
        setTimeout(() => {
          printWindow.print();
        }, 500);
        
        toast({
          title: "PDF 準備完成",
          description: "請在新視窗中列印或另存為 PDF"
        });
      } else {
        throw new Error("無法開啟新視窗");
      }
    } catch (error) {
      toast({
        title: "匯出失敗",
        description: "無法生成 PDF 報告",
        variant: "destructive"
      });
    }
  };

  return (
    <Button variant="outline" onClick={generatePDF}>
      <FileText className="h-4 w-4 mr-2" />
      匯出完整 PDF
    </Button>
  );
}