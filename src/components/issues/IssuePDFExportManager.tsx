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
            /* 強制所有元素字體為深色，覆蓋描述中的內嵌白色樣式 */
            *, th, td, p, h1, h2, h3, h4, h5, h6, span, div, strong, em { color: #111827 !important; -webkit-text-fill-color: #111827 !important; }
            [style*="color"] { color: #111827 !important; -webkit-text-fill-color: #111827 !important; }
            a { color: #111827 !important; text-decoration: underline; }
            
            /* 標題區域 */
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #374151; padding-bottom: 15px; }
            .header h1 { font-size: 24px; margin: 0 0 10px 0; }
            .header p { font-size: 14px; margin: 0; }
            
            /* 統計摘要區域 */
            .summary { background: #f8f9fa !important; padding: 20px; margin-bottom: 25px; border-left: 4px solid #374151; }
            .summary h2 { font-size: 18px; margin: 0 0 15px 0; }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
            .stat-item { display: flex; justify-content: space-between; padding: 5px 0; }
            .stat-label { font-weight: bold; }
            .stat-value { font-weight: bold; }
            
            /* 問題詳細區域 */
            .issues-detailed { margin-bottom: 30px; }
            .issues-detailed h2 { font-size: 20px; margin: 0 0 20px 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
            
            /* 問題卡片 */
            .issue-card { border: 1px solid #ddd; margin-bottom: 25px; page-break-inside: avoid; background: #fafafa !important; }
            .issue-header { background: #e9ecef !important; padding: 15px; border-bottom: 1px solid #ddd; }
            .issue-title { font-size: 16px; font-weight: bold; margin: 0 0 8px 0; }
            .issue-meta { display: flex; gap: 10px; font-size: 14px; }
            
            /* 問題資訊 */
            .issue-info { padding: 15px; background: #ffffff !important; }
            .info-row { display: flex; padding: 3px 0; }
            .info-label { font-weight: bold; min-width: 80px; margin-right: 10px; }
            .info-value { flex: 1; }
            
            /* 問題內容 */
            .issue-content { padding: 15px; background: #ffffff !important; }
            .content-section { margin-bottom: 15px; }
            .content-title { font-size: 14px; font-weight: bold; margin: 0 0 8px 0; color: #374151 !important; }
            .content-text { 
              font-size: 12px; 
              line-height: 1.5; 
              padding: 10px; 
              background: #f8f9fa !important; 
              border-left: 3px solid #dee2e6; 
              white-space: pre-wrap; 
              word-break: break-word; 
            }
            
            /* 優先級和狀態顏色 */
            .priority-critical { color: #b91c1c !important; font-weight: bold; }
            .priority-high { color: #c2410c !important; font-weight: bold; }
            .priority-medium { color: #a16207 !important; font-weight: bold; }
            .priority-low { color: #15803d !important; font-weight: bold; }
            .status-open { color: #b91c1c !important; font-weight: bold; }
            .status-in_progress { color: #a16207 !important; font-weight: bold; }
            .status-resolved { color: #15803d !important; font-weight: bold; }
            .status-closed { color: #374151 !important; font-weight: bold; }
            
            /* 頁尾 */
            .footer { 
              margin-top: 30px; 
              text-align: center; 
              font-size: 12px; 
              color: #374151 !important; 
              border-top: 1px solid #ddd; 
              padding-top: 15px; 
            }
            
            /* 列印優化 */
            @media print { 
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .issue-card { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>問題追蹤詳細報告</h1>
            <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          <div class="summary">
            <h2>統計摘要</h2>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">總問題數量:</span>
                <span class="stat-value">${issues.length}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">開啟問題:</span>
                <span class="stat-value">${issues.filter(i => i.status === 'open').length}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">處理中問題:</span>
                <span class="stat-value">${issues.filter(i => i.status === 'in_progress').length}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">已解決問題:</span>
                <span class="stat-value">${issues.filter(i => i.status === 'resolved').length}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">已關閉問題:</span>
                <span class="stat-value">${issues.filter(i => i.status === 'closed').length}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">緊急問題:</span>
                <span class="stat-value priority-critical">${issues.filter(i => i.priority === 'critical').length}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">高優先級問題:</span>
                <span class="stat-value priority-high">${issues.filter(i => i.priority === 'high').length}</span>
              </div>
            </div>
          </div>
          
          <div class="issues-detailed">
            <h2>問題詳細清單</h2>
            ${issues.map((issue, index) => {
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
                <div class="issue-card">
                  <div class="issue-header">
                    <h3 class="issue-title">${index + 1}. ${issue.title}</h3>
                    <div class="issue-meta">
                      <span class="priority-${issue.priority}">[${getPriorityText(issue.priority)}]</span>
                      <span class="status-${issue.status}">[${getStatusText(issue.status)}]</span>
                    </div>
                  </div>
                  
                  <div class="issue-info">
                    <div class="info-row">
                      <span class="info-label">系統:</span>
                      <span class="info-value">${issue.system_name || '-'}${issue.serial_number ? ` (${issue.serial_number})` : ''}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">測試站:</span>
                      <span class="info-value">${issue.station_name || '-'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">測試項目:</span>
                      <span class="info-value">${issue.test_item_name || '-'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">負責人:</span>
                      <span class="info-value">${issue.assigned_to || '-'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">問題分類:</span>
                      <span class="info-value">${issue.category || '-'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">建立時間:</span>
                      <span class="info-value">${new Date(issue.created_at).toLocaleString('zh-TW')}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">更新時間:</span>
                      <span class="info-value">${new Date(issue.updated_at).toLocaleString('zh-TW')}</span>
                    </div>
                  </div>
                  
                  <div class="issue-content">
                    <div class="content-section">
                      <h4 class="content-title">問題描述</h4>
                      <div class="content-text">${stripHtml(issue.description || '無描述')}</div>
                    </div>
                    
                    ${issue.process_notes ? `
                      <div class="content-section">
                        <h4 class="content-title">處理過程</h4>
                        <div class="content-text">${stripHtml(issue.process_notes)}</div>
                      </div>
                    ` : ''}
                    
                    ${issue.solution ? `
                      <div class="content-section">
                        <h4 class="content-title">解決方案</h4>
                        <div class="content-text">${stripHtml(issue.solution)}</div>
                      </div>
                    ` : ''}
                    
                    ${issue.relate ? `
                      <div class="content-section">
                        <h4 class="content-title">相關資訊</h4>
                        <div class="content-text">${stripHtml(issue.relate)}</div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="footer">
            <p>此報告由問題追蹤系統自動生成 | 共 ${issues.length} 個問題</p>
          </div>
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
      匯出 PDF 報告
    </Button>
  );
}