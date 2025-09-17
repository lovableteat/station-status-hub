import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to?: string;
  system_id?: string;
  station_id?: string;
  created_at: string;
  updated_at: string;
}

interface IssuePDFExportManagerProps {
  issues: Issue[];
}

export function IssuePDFExportManager({ issues }: IssuePDFExportManagerProps) {
  const { toast } = useToast();

  const generatePDF = () => {
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light" />
          <title>問題追蹤報告</title>
          <style>
            html, body { background: #ffffff; }
            body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
            *, th, td, p, h1, h2, h3, h4, h5, h6, span, div, strong, em { color: #111827; }
            .header { text-align: center; margin-bottom: 30px; }
            .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .priority-critical { color: #b91c1c; font-weight: bold; }
            .priority-high { color: #c2410c; font-weight: bold; }
            .priority-medium { color: #a16207; font-weight: bold; }
            .priority-low { color: #15803d; font-weight: bold; }
            .status-open { color: #b91c1c; }
            .status-in_progress { color: #a16207; }
            .status-resolved { color: #15803d; }
            .status-closed { color: #374151; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #374151; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>問題追蹤報告</h1>
            <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          <div class="summary">
            <h2>統計摘要</h2>
            <p>總問題數量: ${issues.length}</p>
            <p>開啟問題: ${issues.filter(i => i.status === 'open').length}</p>
            <p>處理中問題: ${issues.filter(i => i.status === 'in_progress').length}</p>
            <p>已解決問題: ${issues.filter(i => i.status === 'resolved').length}</p>
            <p>已關閉問題: ${issues.filter(i => i.status === 'closed').length}</p>
            <p>緊急問題: ${issues.filter(i => i.priority === 'critical').length}</p>
            <p>高優先級問題: ${issues.filter(i => i.priority === 'high').length}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>問題標題</th>
                <th>描述</th>
                <th>優先級</th>
                <th>狀態</th>
                <th>負責人</th>
                <th>系統</th>
                <th>站點</th>
                <th>建立時間</th>
                <th>更新時間</th>
              </tr>
            </thead>
            <tbody>
              ${issues.map(issue => {
                const getPriorityText = (priority: string) => {
                  switch (priority) {
                    case 'critical': return '緊急';
                    case 'high': return '高';
                    case 'medium': return '中';
                    case 'low': return '低';
                    default: return priority;
                  }
                };
                
                const getStatusText = (status: string) => {
                  switch (status) {
                    case 'open': return '開啟';
                    case 'in_progress': return '處理中';
                    case 'resolved': return '已解決';
                    case 'closed': return '已關閉';
                    default: return status;
                  }
                };
                
                return `
                  <tr>
                    <td><strong>${issue.title}</strong></td>
                    <td>${issue.description}</td>
                    <td class="priority-${issue.priority}">${getPriorityText(issue.priority)}</td>
                    <td class="status-${issue.status}">${getStatusText(issue.status)}</td>
                    <td>${issue.assigned_to || '-'}</td>
                    <td>${issue.system_id || '-'}</td>
                    <td>${issue.station_id || '-'}</td>
                    <td>${new Date(issue.created_at).toLocaleDateString('zh-TW')}</td>
                    <td>${new Date(issue.updated_at).toLocaleDateString('zh-TW')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p>此報告由問題追蹤系統自動生成</p>
          </div>
        </body>
        </html>
      `;

      // 創建新視窗並寫入 HTML 內容
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // 等待內容載入後列印
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
      匯出 PDF 報告
    </Button>
  );
}