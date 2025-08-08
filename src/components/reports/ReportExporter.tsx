import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SystemProgressData } from "./ProgressCalculator";

interface ReportExporterProps {
  data: SystemProgressData[];
  title?: string;
}

export function ReportExporter({ data, title = "GB300 L10 測試進度報告" }: ReportExporterProps) {
  const { toast } = useToast();

  const exportToPDF = () => {
    try {
      // 生成統計數據
      const total = data.length;
      const completed = data.filter(d => d.status === '已完成').length;
      const inProgress = data.filter(d => d.status === '進行中').length;
      const notStarted = data.filter(d => d.status === '未開始').length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <style>
            body { 
              font-family: Arial, 'Microsoft YaHei', sans-serif; 
              margin: 20px; 
              font-size: 14px;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .header h1 { 
              color: #333; 
              margin-bottom: 10px; 
            }
            .summary { 
              background: #f8f9fa; 
              padding: 20px; 
              margin-bottom: 30px; 
              border-radius: 8px;
              border: 1px solid #dee2e6;
            }
            .summary h2 { 
              color: #495057; 
              margin-top: 0; 
              margin-bottom: 15px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 15px;
            }
            .summary-item {
              background: white;
              padding: 15px;
              border-radius: 6px;
              border: 1px solid #e9ecef;
              text-align: center;
            }
            .summary-value {
              font-size: 24px;
              font-weight: bold;
              color: #007bff;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px; 
              font-size: 12px;
            }
            th, td { 
              border: 1px solid #dee2e6; 
              padding: 10px 8px; 
              text-align: center; 
            }
            th { 
              background-color: #f8f9fa; 
              font-weight: bold;
              color: #495057;
            }
            .status-completed { color: #28a745; font-weight: bold; }
            .status-inprogress { color: #fd7e14; font-weight: bold; }
            .status-notstarted { color: #dc3545; font-weight: bold; }
            .progress-100 { color: #28a745; font-weight: bold; }
            .progress-high { color: #fd7e14; font-weight: bold; }
            .progress-low { color: #007bff; font-weight: bold; }
            .progress-zero { color: #dc3545; font-weight: bold; }
            .footer { 
              margin-top: 40px; 
              text-align: center; 
              font-size: 12px; 
              color: #6c757d; 
              border-top: 1px solid #dee2e6;
              padding-top: 20px;
            }
            .system-name { font-weight: bold; }
            .exclude-no { color: #dc3545; }
            .exclude-yes { color: #28a745; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${title}</h1>
            <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          <div class="summary">
            <h2>統計摘要</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <div class="summary-value">${total}</div>
                <div>總系統數</div>
              </div>
              <div class="summary-item">
                <div class="summary-value" style="color: #28a745">${completed}</div>
                <div>已完成</div>
              </div>
              <div class="summary-item">
                <div class="summary-value" style="color: #fd7e14">${inProgress}</div>
                <div>進行中</div>
              </div>
              <div class="summary-item">
                <div class="summary-value" style="color: #dc3545">${notStarted}</div>
                <div>未開始</div>
              </div>
              <div class="summary-item">
                <div class="summary-value" style="color: #007bff">${completionRate}%</div>
                <div>完成率</div>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>系統編號</th>
                <th>負責工程師</th>
                <th>整體狀態</th>
                <th>Station 0<br/>工廠組裝</th>
                <th>Station 1<br/>開機</th>
                <th>Station 2<br/>FW & SFT</th>
                <th>Station 3<br/>NV diag</th>
                <th>整體進度</th>
                <th>開始時間</th>
                <th>完成時間</th>
                <th>列入統計</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(item => {
                const getProgressClass = (progress: number) => {
                  if (progress === 100) return 'progress-100';
                  if (progress >= 50) return 'progress-high';
                  if (progress > 0) return 'progress-low';
                  return 'progress-zero';
                };

                const getStatusClass = (status: string) => {
                  if (status === '已完成') return 'status-completed';
                  if (status === '進行中') return 'status-inprogress';
                  return 'status-notstarted';
                };

                const formatDateTime = (dateString?: string) => {
                  if (!dateString) return '-';
                  return new Date(dateString).toLocaleDateString('zh-TW') + '<br/>' + 
                         new Date(dateString).toLocaleTimeString('zh-TW');
                };

                return `
                  <tr>
                    <td class="system-name">${item.systemName}</td>
                    <td>${item.assignedEngineer}</td>
                    <td class="${getStatusClass(item.status)}">${item.status}</td>
                    <td class="${getProgressClass(item.station0Progress)}">${item.station0Progress}%</td>
                    <td class="${getProgressClass(item.station1Progress)}">${item.station1Progress}%</td>
                    <td class="${getProgressClass(item.station2Progress)}">${item.station2Progress}%</td>
                    <td class="${getProgressClass(item.station3Progress)}">${item.station3Progress}%</td>
                    <td class="${getProgressClass(item.overallProgress)}">${item.overallProgress}%</td>
                    <td style="font-size: 10px;">${formatDateTime(item.actualStartedAt)}</td>
                    <td style="font-size: 10px;">${formatDateTime(item.actualCompletedAt)}</td>
                    <td class="${item.excludeFromDashboard ? 'exclude-no' : 'exclude-yes'}">
                      ${item.excludeFromDashboard ? '否' : '是'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p>此報告由 GB300 L10 測試管理系統自動生成</p>
            <p>報告包含 ${data.length} 個系統的詳細測試進度信息</p>
          </div>
        </body>
        </html>
      `;

      // 開啟新視窗並列印
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
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
      console.error('PDF export error:', error);
      toast({
        title: "匯出失敗",
        description: "無法生成 PDF 報告",
        variant: "destructive"
      });
    }
  };

  const exportToExcel = async () => {
    try {
      const { generateExcel, downloadFile } = await import('@/utils/exportUtils');
      
      // 準備Excel數據
      const excelData = data.map(item => ({
        id: item.systemId,
        system_name: item.systemName,
        assigned_engineer: item.assignedEngineer,
        status: item.status,
        overall_progress: item.overallProgress,
        actual_started_at: item.actualStartedAt,
        actual_completed_at: item.actualCompletedAt,
        exclude_from_dashboard: item.excludeFromDashboard
      }));

      // 模擬stations和testItems數據用於Excel生成
      const stations = [
        { id: 'station0', station_name: 'Station 0 - 工廠組裝', station_order: 0 },
        { id: 'station1', station_name: 'Station 1 - 開機', station_order: 1 },
        { id: 'station2', station_name: 'Station 2 - FW & SFT', station_order: 2 },
        { id: 'station3', station_name: 'Station 3 - NV diag', station_order: 3 }
      ];

      const progress = data.flatMap(item => [
        { system_id: item.systemId, station_id: 'station0', status: 'Done', progress_percent: item.station0Progress },
        { system_id: item.systemId, station_id: 'station1', status: 'Done', progress_percent: item.station1Progress },
        { system_id: item.systemId, station_id: 'station2', status: 'Done', progress_percent: item.station2Progress },
        { system_id: item.systemId, station_id: 'station3', status: 'Done', progress_percent: item.station3Progress }
      ]);

      const excelBlob = await generateExcel(title, excelData, stations, [], progress);
      const fileName = `${title}_${new Date().toISOString().split('T')[0]}.xlsx`;
      downloadFile(excelBlob, fileName);
      
      toast({
        title: "匯出成功",
        description: `已匯出 ${data.length} 筆記錄到 Excel`,
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "匯出失敗",
        description: "Excel 匯出時發生錯誤",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={exportToPDF}>
        <FileText className="h-4 w-4 mr-2" />
        匯出 PDF
      </Button>
      <Button variant="outline" onClick={exportToExcel}>
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        匯出 Excel
      </Button>
    </div>
  );
}