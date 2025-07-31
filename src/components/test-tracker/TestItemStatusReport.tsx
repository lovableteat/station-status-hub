import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";

interface TestItemStatusReportProps {
  systems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
}

export function TestItemStatusReport({
  systems,
  stations,
  items,
  progress
}: TestItemStatusReportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const getProgressForSystemItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'text-success';
      case 'On-going': return 'text-warning';
      case 'Not Start': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-success text-success-foreground';
      case 'On-going': return 'bg-warning text-warning-foreground';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const exportReport = async () => {
    try {
      setIsExporting(true);
      
      // 準備報表數據
      const reportData: any[] = [];
      
      systems.forEach(system => {
        stations.forEach(station => {
          const stationItems = items.filter(item => item.station_id === station.id);
          
          stationItems.forEach((item, index) => {
            const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
            
            reportData.push({
              systemName: system.system_name,
              serialNumber: system.serial_number || '',
              nicMacAddress: (system as any).os_mac_address || '',
              bmcAddress: (system as any).bmc_address || '',
              stationName: station.station_name,
              itemSeq: index + 1,
              itemName: item.item_name,
              itemDescription: item.description || '',
              status: itemProgress?.status || 'Not Start',
              progressPercent: itemProgress?.progress_percent || 0,
              notes: itemProgress?.notes || '',
              startedAt: formatTime(itemProgress?.started_at),
              completedAt: formatTime(itemProgress?.completed_at),
              assignedTo: system.assigned_engineer || '',
              ubuntuVersion: (system as any).ubuntu_version || '',
              cudaVersion: (system as any).cuda_version || ''
            });
          });
        });
      });

      // 生成HTML報表
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>GB300 L10 測項狀態報表</title>
          <style>
            body { 
              font-family: 'Microsoft JhengHei', 'Noto Sans TC', Arial, sans-serif; 
              margin: 20px; 
              font-size: 12px;
              line-height: 1.4;
            }
            .header { 
              background: hsl(217 91% 60%); 
              color: white; 
              padding: 20px; 
              text-align: center; 
              margin-bottom: 20px;
              border-radius: 8px;
            }
            .header h1 { margin: 0 0 10px 0; font-size: 24px; }
            .header p { margin: 0; font-size: 16px; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px; 
              font-size: 11px;
            }
            th, td { 
              border: 1px solid #ddd; 
              padding: 6px; 
              text-align: center; 
              vertical-align: top;
            }
            th { 
              background: hsl(210 40% 96%); 
              font-weight: bold; 
              color: hsl(222.2 47.4% 11.2%);
              position: sticky;
              top: 0;
            }
            .status-done { color: hsl(142 76% 36%); font-weight: bold; }
            .status-ongoing { color: hsl(38 92% 50%); font-weight: bold; }
            .status-notstart { color: hsl(215.4 16.3% 46.9%); }
            tr:nth-child(even) { background-color: hsl(210 40% 98%); }
            .notes-cell { max-width: 150px; word-wrap: break-word; text-align: left; }
            .footer {
              margin-top: 30px; 
              text-align: center; 
              color: #666; 
              font-size: 11px;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
            @media print {
              body { margin: 0; font-size: 10px; }
              .no-print { display: none; }
              th, td { padding: 4px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GB300 L10 測項狀態報表</h1>
            <p>報表生成時間: ${new Date().toLocaleString('zh-TW')}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>機台編號</th>
                <th>序號</th>
                <th>NIC MAC</th>
                <th>BMC Address</th>
                <th>站點</th>
                <th>測項序號</th>
                <th>測項名稱</th>
                <th>測項說明</th>
                <th>狀態</th>
                <th>進度%</th>
                <th>開始時間</th>
                <th>完成時間</th>
                <th>負責人</th>
                <th>Ubuntu版本</th>
                <th>CUDA版本</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.map(item => `
                <tr>
                  <td>${item.systemName}</td>
                  <td>${item.serialNumber}</td>
                  <td>${item.nicMacAddress}</td>
                  <td>${item.bmcAddress}</td>
                  <td>${item.stationName}</td>
                  <td>${item.itemSeq}</td>
                  <td style="text-align: left;">${item.itemName}</td>
                  <td style="text-align: left;">${item.itemDescription}</td>
                  <td class="status-${item.status.toLowerCase().replace(/[^a-z]/g, '')}">${item.status}</td>
                  <td>${item.progressPercent}%</td>
                  <td>${item.startedAt}</td>
                  <td>${item.completedAt}</td>
                  <td>${item.assignedTo}</td>
                  <td>${item.ubuntuVersion}</td>
                  <td>${item.cudaVersion}</td>
                  <td class="notes-cell">${item.notes}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            GB300 L10 測項狀態報表 | 共 ${systems.length} 台機器，${reportData.length} 筆測項記錄
          </div>
          
          <div class="no-print" style="position: fixed; top: 20px; right: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: hsl(217 91% 60%); color: white; border: none; border-radius: 4px; cursor: pointer;">列印 / 儲存為PDF</button>
            <button onclick="window.close()" style="padding: 10px 20px; background: hsl(215.4 16.3% 46.9%); color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">關閉</button>
          </div>
        </body>
        </html>
      `;
      
      // 開新視窗並顯示報表
      const printWindow = window.open('', '_blank', 'width=1400,height=900');
      if (!printWindow) {
        throw new Error('無法開啟列印視窗，請檢查瀏覽器彈出視窗設定');
      }
      
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      toast({
        title: "匯出成功",
        description: "測項狀態報表已成功匯出",
      });
      
    } catch (error) {
      console.error('Report export failed:', error);
      toast({
        title: "匯出失敗",
        description: "報表匯出過程中發生錯誤",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 統計數據
  const totalItems = systems.length * stations.reduce((sum, station) => 
    sum + items.filter(item => item.station_id === station.id).length, 0
  );
  
  const completedItems = progress.filter(p => p.status === 'Done').length;
  const ongoingItems = progress.filter(p => p.status === 'On-going').length;
  const notStartedItems = totalItems - completedItems - ongoingItems;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            測項狀態報表
          </CardTitle>
          <Button onClick={exportReport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "匯出中..." : "匯出 PDF 報表"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 統計概覽 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{totalItems}</div>
              <div className="text-sm text-muted-foreground">總測項數</div>
            </div>
            <div className="text-center p-4 bg-success/10 rounded-lg">
              <div className="text-2xl font-bold text-success">{completedItems}</div>
              <div className="text-sm text-muted-foreground">已完成</div>
            </div>
            <div className="text-center p-4 bg-warning/10 rounded-lg">
              <div className="text-2xl font-bold text-warning">{ongoingItems}</div>
              <div className="text-sm text-muted-foreground">進行中</div>
            </div>
            <div className="text-center p-4 bg-muted/20 rounded-lg">
              <div className="text-2xl font-bold text-muted-foreground">{notStartedItems}</div>
              <div className="text-sm text-muted-foreground">未開始</div>
            </div>
          </div>

          {/* 報表預覽 - 全部顯示 */}
          <div className="overflow-x-auto">
            <div className="text-sm text-muted-foreground mb-2">
              完整報表預覽 - 所有測項記錄
            </div>
            <table className="w-full text-xs border-collapse border border-border">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border border-border p-2">機台編號</th>
                  <th className="border border-border p-2">序號</th>
                  <th className="border border-border p-2">NIC MAC</th>
                  <th className="border border-border p-2">BMC Address</th>
                  <th className="border border-border p-2">站點</th>
                  <th className="border border-border p-2">測項序號</th>
                  <th className="border border-border p-2">測項名稱</th>
                  <th className="border border-border p-2">狀態</th>
                  <th className="border border-border p-2">進度</th>
                  <th className="border border-border p-2">開始時間</th>
                  <th className="border border-border p-2">完成時間</th>
                  <th className="border border-border p-2">負責人</th>
                  <th className="border border-border p-2">Ubuntu版本</th>
                  <th className="border border-border p-2">CUDA版本</th>
                  <th className="border border-border p-2">備註</th>
                </tr>
              </thead>
              <tbody>
                {systems.map(system => 
                  stations.map(station => 
                    items.filter(item => item.station_id === station.id).map((item, index) => {
                      const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                      return (
                        <tr key={`${system.id}-${station.id}-${item.id}`} className="hover:bg-muted/25">
                          <td className="border border-border p-2">{system.system_name}</td>
                          <td className="border border-border p-2">{system.serial_number || '-'}</td>
                          <td className="border border-border p-2 text-xs">{(system as any).os_mac_address || '-'}</td>
                          <td className="border border-border p-2 text-xs">{(system as any).bmc_address || '-'}</td>
                          <td className="border border-border p-2">{station.station_name}</td>
                          <td className="border border-border p-2">{index + 1}</td>
                          <td className="border border-border p-2 text-left">{item.item_name}</td>
                          <td className="border border-border p-2">
                            <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(itemProgress?.status || 'Not Start')}`}>
                              {itemProgress?.status || 'Not Start'}
                            </span>
                          </td>
                          <td className="border border-border p-2">{itemProgress?.progress_percent || 0}%</td>
                          <td className="border border-border p-2">{formatTime(itemProgress?.started_at)}</td>
                          <td className="border border-border p-2">{formatTime(itemProgress?.completed_at)}</td>
                          <td className="border border-border p-2">{system.assigned_engineer || '-'}</td>
                          <td className="border border-border p-2">{(system as any).ubuntu_version || '-'}</td>
                          <td className="border border-border p-2">{(system as any).cuda_version || '-'}</td>
                          <td className="border border-border p-2 text-left max-w-32 truncate" title={itemProgress?.notes || ''}>
                            {itemProgress?.notes || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )
                ).flat().flat()}
              </tbody>
            </table>
            <div className="text-xs text-muted-foreground mt-2 text-center">
              共 {systems.length} 台機器，{systems.length * stations.reduce((sum, station) => sum + items.filter(item => item.station_id === station.id).length, 0)} 筆測項記錄
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}