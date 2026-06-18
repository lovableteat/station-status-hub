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
  test_item_id?: string;
  created_at: string;
  updated_at: string;
  process_notes?: string;
  solution?: string;
  category?: string;
  relate?: string;
  system_name?: string;
  serial_number?: string;
  assigned_engineer?: string;
  station_name?: string;
  station_order?: number;
  test_item_name?: string;
  test_item_description?: string;
}

interface IssuePDFExportManagerProps {
  issues: Issue[];
}

export function IssuePDFExportManager({ issues }: IssuePDFExportManagerProps) {
  const { toast } = useToast();

  const generatePDF = () => {
    try {
      const openCount = issues.filter(issue => issue.status === 'open').length;
      const inProgressCount = issues.filter(issue => issue.status === 'in_progress').length;
      const resolvedCount = issues.filter(issue => issue.status === 'resolved' || issue.status === 'closed').length;
      const resolutionRate = issues.length > 0 ? Math.round((resolvedCount / issues.length) * 100) : 0;
      const categoryCounts = issues.reduce<Record<string, number>>((counts, issue) => {
        const category = issue.category || '未分類';
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {});

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light" />
          <title>問題追蹤詳細報告</title>
          <style>
            /* 基礎顏色與列印最佳化 */
            html, body { background: #ffffff !important; }
            body { font-family: Arial, sans-serif; margin: 20px; color: #111827 !important; line-height: 1.4; }
            /* 強制所有元素字體為深色，覆蓋內嵌白色樣式 */
            *, th, td, p, h1, h2, h3, h4, h5, h6, span, div, strong, em { color: #111827 !important; -webkit-text-fill-color: #111827 !important; }
            [style*="color"] { color: #111827 !important; -webkit-text-fill-color: #111827 !important; }
            
            /* 標題區域 */
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #374151; padding-bottom: 15px; }
            .header h1 { font-size: 24px; margin: 0 0 10px 0; font-weight: bold; }
            .header p { font-size: 14px; margin: 0; color: #6b7280 !important; }

            .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 0 0 24px; }
            .summary-card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; background: #f8fafc !important; }
            .summary-card span { display: block; color: #6b7280 !important; font-size: 11px; margin-bottom: 4px; }
            .summary-card strong { font-size: 20px; color: #111827 !important; }
            .section-title { margin: 22px 0 10px; font-size: 16px; font-weight: bold; }
            
            /* 表格樣式 */
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px; 
              font-size: 12px;
            }
            th { 
              background-color: #f3f4f6 !important; 
              border: 1px solid #d1d5db; 
              padding: 12px 8px; 
              text-align: left; 
              font-weight: bold;
              vertical-align: top;
            }
            td { 
              border: 1px solid #d1d5db; 
              padding: 10px 8px; 
              text-align: left; 
              vertical-align: top; 
              word-break: break-word; 
              white-space: pre-wrap;
              line-height: 1.4;
            }
            tr:nth-child(even) { background-color: #f9fafb !important; }
            tr:hover { background-color: #f3f4f6 !important; }
            
            /* 優先級和狀態顏色 */
            .priority-critical { color: #dc2626 !important; font-weight: bold; }
            .priority-high { color: #ea580c !important; font-weight: bold; }
            .priority-medium { color: #d97706 !important; font-weight: bold; }
            .priority-low { color: #16a34a !important; font-weight: bold; }
            .status-open { color: #dc2626 !important; font-weight: bold; }
            .status-in_progress { color: #d97706 !important; font-weight: bold; }
            .status-resolved { color: #16a34a !important; font-weight: bold; }
            .status-closed { color: #6b7280 !important; font-weight: bold; }
            
            /* 列印優化 */
            @media print { 
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              table { page-break-inside: avoid; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>工廠問題追蹤與統計報告</h1>
            <p>生成時間: ${new Date().toLocaleString('zh-TW')} | 共 ${issues.length} 個問題</p>
          </div>

          <div class="summary">
            <div class="summary-card"><span>問題總數</span><strong>${issues.length}</strong></div>
            <div class="summary-card"><span>待處理</span><strong>${openCount}</strong></div>
            <div class="summary-card"><span>處理中</span><strong>${inProgressCount}</strong></div>
            <div class="summary-card"><span>已解決／關閉</span><strong>${resolvedCount}</strong></div>
            <div class="summary-card"><span>解決率</span><strong>${resolutionRate}%</strong></div>
          </div>

          <div class="section-title">問題分類摘要</div>
          <table>
            <thead><tr><th>問題分類</th><th>數量</th><th>占比</th></tr></thead>
            <tbody>
              ${Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => `
                  <tr>
                    <td>${category}</td>
                    <td>${count}</td>
                    <td>${issues.length > 0 ? ((count / issues.length) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>

          <div class="section-title">問題明細</div>
          
          <table>
            <thead>
              <tr>
                <th width="20%">問題標題</th>
                <th width="20%">描述</th>
                <th width="20%">處理過程</th>
                <th width="15%">解決方案</th>
                <th width="8%">優先級</th>
                <th width="8%">狀態</th>
                <th width="7%">負責人</th>
                <th width="12%">建立時間</th>
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
                
                const stripHtml = (html: string) => {
                  if (!html) return '';
                  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                };
                
                return `
                  <tr>
                    <td><strong>${issue.title}</strong></td>
                    <td>${stripHtml(issue.description || '-')}</td>
                    <td>${stripHtml(issue.process_notes || '-')}</td>
                    <td>${stripHtml(issue.solution || '-')}</td>
                    <td class="priority-${issue.priority}">${getPriorityText(issue.priority)}</td>
                    <td class="status-${issue.status}">${getStatusText(issue.status)}</td>
                    <td>${issue.assigned_to || '-'}</td>
                    <td>${new Date(issue.created_at).toLocaleDateString('zh-TW')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      // 創建新視窗並寫入 HTML 內容
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        const tryPrint = () => {
          try {
            printWindow.focus();
            printWindow.print();
          } catch {}
        };

        if (printWindow.document.readyState === 'complete') {
          tryPrint();
        } else {
          printWindow.addEventListener('load', tryPrint, { once: true });
          setTimeout(tryPrint, 600);
        }
        
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
      匯出工廠報告
    </Button>
  );
}
