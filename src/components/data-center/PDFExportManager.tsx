
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
          <meta charset="UTF-8">
          <title>測試進度報告</title>
          <style>
            body { 
              font-family: 'Microsoft JhengHei', Arial, sans-serif; 
              margin: 20px; 
              background: white;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #333;
              padding-bottom: 15px;
            }
            .summary { 
              background: #f8f9fa; 
              padding: 20px; 
              margin-bottom: 25px; 
              border-radius: 8px;
              border: 1px solid #dee2e6;
            }
            .summary h2 { margin-top: 0; color: #495057; }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 15px;
              margin-top: 15px;
            }
            .summary-item {
              background: white;
              padding: 10px;
              border-radius: 5px;
              border: 1px solid #e9ecef;
            }
            .summary-item strong { color: #007bff; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px; 
              font-size: 11px;
            }
            th, td { 
              border: 1px solid #dee2e6; 
              padding: 6px; 
              text-align: left; 
              word-break: break-word;
              max-width: 150px;
            }
            th { 
              background-color: #343a40; 
              color: white;
              font-weight: bold;
              text-align: center;
            }
            .status-done { 
              color: #28a745; 
              font-weight: bold; 
              background-color: #d4edda;
            }
            .status-ongoing { 
              color: #fd7e14; 
              font-weight: bold; 
              background-color: #fff3cd;
            }
            .status-notstart { 
              color: #dc3545; 
              font-weight: bold; 
              background-color: #f8d7da;
            }
            .footer { 
              margin-top: 30px; 
              text-align: center; 
              font-size: 10px; 
              color: #6c757d; 
              border-top: 2px solid #dee2e6;
              padding-top: 15px;
            }
            .progress-bar {
              width: 100%;
              height: 20px;
              background-color: #e9ecef;
              border-radius: 10px;
              overflow: hidden;
            }
            .progress-fill {
              height: 100%;
              background-color: #28a745;
              transition: width 0.3s ease;
            }
            @media print {
              body { margin: 10px; }
              .header, .summary { break-inside: avoid; }
              table { break-inside: auto; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GB300 L10 測試進度報告</h1>
            <p style="font-size: 14px; color: #6c757d;">生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          <div class="summary">
            <h2>統計摘要</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <strong>總測試項目:</strong> ${records.length}
              </div>
              <div class="summary-item">
                <strong>已完成:</strong> ${records.filter(r => r.status === 'Done').length}
              </div>
              <div class="summary-item">
                <strong>進行中:</strong> ${records.filter(r => r.status === 'On-going').length}
              </div>
              <div class="summary-item">
                <strong>未開始:</strong> ${records.filter(r => r.status === 'Not Start').length}
              </div>
              <div class="summary-item">
                <strong>完成率:</strong> ${Math.round((records.filter(r => r.status === 'Done').length / records.length) * 100)}%
              </div>
              <div class="summary-item">
                <strong>測試站點:</strong> Station 0-4
              </div>
            </div>
            <div style="margin-top: 15px;">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.round((records.filter(r => r.status === 'Done').length / records.length) * 100)}%"></div>
              </div>
            </div>
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
                  <td><strong>${record.system_name}</strong></td>
                  <td>${record.station_name}</td>
                  <td>${record.test_item}</td>
                  <td class="status-${record.status.toLowerCase().replace(' ', '')}">${record.status}</td>
                  <td><strong>${record.progress}%</strong></td>
                  <td>${record.assigned_engineer}</td>
                  <td>${record.start_date}</td>
                  <td>${record.completion_date || '-'}</td>
                  <td>${record.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p><strong>此報告由 GB300 L10 測試管理系統自動生成</strong></p>
            <p>Production Testing System - Quality Assurance Report</p>
            <p>版權所有 © ${new Date().getFullYear()}</p>
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
        }, 1000);
        
        toast({
          title: "PDF 準備完成",
          description: "請在新視窗中列印或另存為 PDF"
        });
      } else {
        throw new Error("無法開啟新視窗，請檢查瀏覽器的彈出視窗設定");
      }
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "匯出失敗",
        description: "無法生成 PDF 報告: " + (error as Error).message,
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
