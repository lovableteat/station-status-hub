import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ProductionRecord {
  id: string;
  system_id: string;
  system_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  rework_count: number;
  is_rework: boolean;
  notes: string | null;
  engineer: string | null;
  station_name?: string;
  progress_percent?: number;
}

interface ProductionHistoryPDFExporterProps {
  className?: string;
}

export function ProductionHistoryPDFExporter({ className }: ProductionHistoryPDFExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const generateProductionHistoryPDF = async () => {
    try {
      setIsExporting(true);
      
      // 獲取生產履歷資料
      const { data: systems, error: systemError } = await supabase
        .from('test_systems')
        .select(`
          id,
          system_name,
          status,
          actual_started_at,
          actual_completed_at,
          assigned_engineer,
          overall_progress,
          current_station,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (systemError) {
        throw new Error('無法載入系統資料');
      }

      // 獲取測試進度資料
      const { data: progress, error: progressError } = await supabase
        .from('test_progress')
        .select(`
          system_id,
          station_id,
          item_id,
          status,
          progress_percent,
          started_at,
          completed_at,
          assigned_to,
          notes
        `);

      if (progressError) {
        throw new Error('無法載入進度資料');
      }

      // 獲取站點資料
      const { data: stations, error: stationError } = await supabase
        .from('test_flow_stations')
        .select('*')
        .order('station_order');

      if (stationError) {
        throw new Error('無法載入站點資料');
      }

      // 處理資料
      const productionRecords: ProductionRecord[] = systems?.map(system => {
        const systemProgress = progress?.filter(p => p.system_id === system.id) || [];
        const completedItems = systemProgress.filter(p => p.status === 'Done').length;
        const totalItems = systemProgress.length;
        
        return {
          id: system.id,
          system_id: system.id,
          system_name: system.system_name,
          status: system.status || 'Not Start',
          started_at: system.actual_started_at,
          completed_at: system.actual_completed_at,
          rework_count: systemProgress.filter(p => p.notes?.includes('返工')).length,
          is_rework: systemProgress.some(p => p.notes?.includes('返工')),
          notes: system.assigned_engineer ? `負責工程師: ${system.assigned_engineer}` : null,
          engineer: system.assigned_engineer,
          station_name: system.current_station,
          progress_percent: system.overall_progress || 0
        };
      }) || [];

      // 生成HTML內容
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>生產履歷報告</title>
          <style>
            body { 
              font-family: 'Microsoft JhengHei', Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.4;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #333;
              padding-bottom: 15px;
            }
            .header h1 {
              color: #2563eb;
              margin-bottom: 5px;
            }
            .summary { 
              background: #f8fafc; 
              padding: 20px; 
              margin-bottom: 25px; 
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            }
            .summary h2 {
              color: #1e40af;
              margin-top: 0;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin-top: 15px;
            }
            .summary-item {
              text-align: center;
              background: white;
              padding: 15px;
              border-radius: 6px;
              border: 1px solid #cbd5e1;
            }
            .summary-number {
              font-size: 24px;
              font-weight: bold;
              color: #1e40af;
            }
            .summary-label {
              font-size: 12px;
              color: #64748b;
              margin-top: 5px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px;
              font-size: 11px;
            }
            th, td { 
              border: 1px solid #d1d5db; 
              padding: 8px; 
              text-align: center; 
            }
            th { 
              background-color: #f1f5f9; 
              font-weight: bold;
              color: #374151;
            }
            tr:nth-child(even) {
              background-color: #f9fafb;
            }
            .footer { 
              margin-top: 30px; 
              text-align: center; 
              font-size: 12px; 
              color: #6b7280;
              border-top: 1px solid #e5e7eb;
              padding-top: 15px;
            }
            .status-done { color: #059669; font-weight: bold; }
            .status-ongoing { color: #d97706; font-weight: bold; }
            .status-notstart { color: #dc2626; font-weight: bold; }
            .rework-yes { color: #dc2626; font-weight: bold; }
            .rework-no { color: #059669; }
            .section-title {
              font-size: 16px;
              font-weight: bold;
              margin: 25px 0 15px 0;
              color: #374151;
              border-left: 4px solid #2563eb;
              padding-left: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>生產履歷報告</h1>
            <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
            <p>報告範圍: 全部生產記錄</p>
          </div>
          
          <div class="summary">
            <h2>生產統計摘要</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <div class="summary-number">${productionRecords.length}</div>
                <div class="summary-label">總機台數</div>
              </div>
              <div class="summary-item">
                <div class="summary-number">${productionRecords.filter(r => r.status === 'Done').length}</div>
                <div class="summary-label">已完成</div>
              </div>
              <div class="summary-item">
                <div class="summary-number">${productionRecords.filter(r => r.status === 'On-going').length}</div>
                <div class="summary-label">進行中</div>
              </div>
              <div class="summary-item">
                <div class="summary-number">${productionRecords.filter(r => r.is_rework).length}</div>
                <div class="summary-label">返工機台</div>
              </div>
            </div>
          </div>
          
          <div class="section-title">詳細生產記錄</div>
          <table>
            <thead>
              <tr>
                <th>機台編號</th>
                <th>狀態</th>
                <th>進度</th>
                <th>當前站點</th>
                <th>負責工程師</th>
                <th>開始時間</th>
                <th>完成時間</th>
                <th>返工次數</th>
                <th>是否返工</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              ${productionRecords.map(record => `
                <tr>
                  <td style="font-weight: bold;">${record.system_name}</td>
                  <td class="status-${record.status === 'Done' ? 'done' : record.status === 'On-going' ? 'ongoing' : 'notstart'}">
                    ${record.status === 'Done' ? '已完成' : 
                      record.status === 'On-going' ? '進行中' : 
                      '未開始'}
                  </td>
                  <td>${record.progress_percent}%</td>
                  <td>${record.station_name || '-'}</td>
                  <td>${record.engineer || '-'}</td>
                  <td>${record.started_at ? new Date(record.started_at).toLocaleString('zh-TW') : '-'}</td>
                  <td>${record.completed_at ? new Date(record.completed_at).toLocaleString('zh-TW') : '-'}</td>
                  <td>${record.rework_count}</td>
                  <td class="rework-${record.is_rework ? 'yes' : 'no'}">
                    ${record.is_rework ? '是' : '否'}
                  </td>
                  <td style="text-align: left; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${record.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="section-title">生產效率分析</div>
          <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <p><strong>完成率:</strong> ${((productionRecords.filter(r => r.status === 'Done').length / productionRecords.length) * 100).toFixed(1)}%</p>
            <p><strong>返工率:</strong> ${((productionRecords.filter(r => r.is_rework).length / productionRecords.length) * 100).toFixed(1)}%</p>
            <p><strong>平均進度:</strong> ${(productionRecords.reduce((sum, r) => sum + (r.progress_percent || 0), 0) / productionRecords.length).toFixed(1)}%</p>
          </div>
          
          <div class="footer">
            <p>此報告由生產監控系統自動生成</p>
            <p>包含截至報告生成時間的所有生產履歷記錄</p>
          </div>
        </body>
        </html>
      `;

      // 建立新視窗並打開列印對話框
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // 等待內容載入完成後觸發列印
        setTimeout(() => {
          printWindow.print();
        }, 1000);
        
        toast({
          title: "PDF生產履歷已生成",
          description: "請在新視窗中列印或儲存為PDF",
        });
      } else {
        throw new Error("無法開啟新視窗，請檢查瀏覽器彈出視窗設定");
      }
      
    } catch (error) {
      console.error('生產履歷PDF生成錯誤:', error);
      toast({
        title: "生產履歷匯出失敗",
        description: error instanceof Error ? error.message : "未知錯誤",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button 
      onClick={generateProductionHistoryPDF}
      disabled={isExporting}
      variant="outline"
      className={className}
    >
      <FileText className="h-4 w-4 mr-2" />
      {isExporting ? "生成中..." : "匯出PDF履歷"}
    </Button>
  );
}