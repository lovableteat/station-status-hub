import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Clock, Monitor, Cpu, HardDrive, Zap, Settings, Edit, Plus } from "lucide-react";
import { TestItemManager } from "./TestItemManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
  description: string;
  estimated_hours: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes: number;
}

export function FlowInfo() {
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [stationsRes, itemsRes] = await Promise.all([
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order')
      ]);

      if (stationsRes.data) setStations(stationsRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Calculate total estimated hours for each station based on test items
  const getCalculatedStationHours = (stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
    return (totalMinutes / 60).toFixed(1); // Convert to hours with 1 decimal place
  };

  const getStationIcon = (stationName: string) => {
    if (stationName.includes('ME')) return <Settings className="h-5 w-5" />;
    if (stationName.includes('BIOS')) return <Zap className="h-5 w-5" />;
    if (stationName.includes('EE')) return <HardDrive className="h-5 w-5" />;
    if (stationName.includes('SIT')) return <Cpu className="h-5 w-5" />;
    if (stationName.includes('Station 4')) return <Monitor className="h-5 w-5" />;
    return <Settings className="h-5 w-5" />;
  };

  const getStationColor = (stationOrder: number) => {
    const colors = [
      'bg-blue-500/10 text-blue-700 border-blue-200',
      'bg-green-500/10 text-green-700 border-green-200', 
      'bg-orange-500/10 text-orange-700 border-orange-200',
      'bg-purple-500/10 text-purple-700 border-purple-200',
      'bg-red-500/10 text-red-700 border-red-200'
    ];
    return colors[stationOrder] || colors[0];
  };

  const getDetailedDescription = (stationName: string) => {
    if (stationName.includes('ME') || stationName.includes('Station 0')) {
      return {
        purpose: 'Assembly & Tim Curing (ME TEAM)',
        procedures: [
          'Power on with NV',
          'Chassis Assembly（機殼組裝）',
          'ME Assembly（機構組裝）',
          'Cable Routing（線束佈線）',
          'Tim Curing（加熱至 65 °C 並保持 60 分鐘）',
          'EE/BMC/BIOS 結合 NV 模組進行開機',
          'SIT 釋放 M.2 上 OS，協助 EE 複製至 20 台系統',
          'CDU 熱管理設定支援',
          '系統編號標示',
          '開路／短路檢查，並同時拆下 M.2 複製 OS',
          'UEFI Shell 開機驗證',
          'PCIe 裝置顯示測試'
        ],
        equipment: ['Monitor2', '鍵鼠組2', 'CR203220', 'MiniDP to VGA 轉接器2', 'RJ45 cable(10m)4', 'VGA cable1', 'CX-8 loopback3', 'BF-3 loopback2'],
        notes: '機構組裝與加熱固化階段，結合 NV 模組進行初次開機驗證'
      };
    }
    if (stationName.includes('BIOS') || stationName.includes('Station 1')) {
      return {
        purpose: 'Power on (BIOS/BMC TEAM)',
        procedures: [
          '同 Station 0 的開機流程：',
          '釋放並複製 OS',
          'CDU 熱管理',
          '編號標示',
          '開短路檢查 + M.2 操作',
          'UEFI Shell 驗證',
          'PCIe 顯示（Monitor Display）'
        ],
        equipment: ['Monitor2', '鍵鼠組2', 'USB hub2', 'MiniDP to VGA2', 'PSU*4'],
        notes: '與 Station 0 幾乎相同流程，重複作業於大量系統'
      };
    }
    if (stationName.includes('EE') || stationName.includes('Station 2')) {
      return {
        purpose: 'FW Update (EE TEAM)',
        procedures: [
          'HMC／BMC／EROT／GPU／CX8／BF3 韌體更新',
          'Diag auto-update（排除 BF3、CX8）',
          '手動更新不支援韌體',
          '安裝 BF3/E1.5 更新腳本',
          'FRU 更新',
          'BMC/MAC 更新'
        ],
        equipment: ['Monitor1', 'USB hub1', 'linking board1', 'PSU2'],
        notes: 'BIOS/BMC 為主，EE/ME/MI/Thermal 若需重新組裝。自動更新排除 BF3 & CX8'
      };
    }
    if (stationName.includes('SIT') || stationName.includes('Station 3')) {
      return {
        purpose: 'Function Check (SIT/RAD TEAM)',
        procedures: [
          'lspci：列舉所有 PCIe 裝置',
          'nvidia-smi：驗證 GPU 狀態',
          '插拔檢測：BF3/CX8 狀態',
          'ibstat：檢查 IB 連線',
          'TPM 功能測試',
          'Intel I210 MAC 設定及功能驗證',
          'Diagnostic SFT Test：',
          '影像與 LED 手動檢查',
          'FRU 程式燒錄與驗證',
          'MAC Address 程式燒錄與驗證',
          '韌體版本確認',
          'CPU／DIMM／Disk／PCIe（含 CX7/BF3）／USB／Sensor 驗證',
          '風扇控制與 GPU 狀態檢測',
          'CPU、DIMM、Disk 壓力測試',
          'UUT 資料蒐集（SEL、FRU、Sensor、OS 日誌、CFG 特定項目）',
          '恢復 BIOS 及 BMC 為預設值'
        ],
        equipment: ['Monitor1', 'RJ45 cable(10M)4', 'VGA1', 'loopback cable（CX-83, BF-3*2）'],
        notes: '支援人員：Thermal / EE / MI / ME 如需重新裝配'
      };
    }
    if (stationName.includes('Station 4')) {
      return {
        purpose: 'Partner Diagnostics + Tim Baking',
        procedures: [
          'Tim Baking 流程載入與監控',
          'Partner Diagnostics 腳本執行，包括：',
          'Inventory 檢查',
          'ThermalMgmt、PowerMgmt 等命令',
          '...（其他廠商指定指令集）',
          '測試完成／失敗後 Log Dump'
        ],
        equipment: ['Monitor4', '鍵鼠組4', 'MiniDP to VGA4', 'linking board4', 'PSU*8', 'CX8 loopback8', 'BF3 loopback8'],
        notes: '與 Diag Team 協同測試 BF3 與 1G NIC 同網段。SIT / RAD 協助執行 NV Diag 測項'
      };
    }
    return { purpose: '', procedures: [], equipment: [], notes: '' };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-muted-foreground">各測試站點詳細流程說明與所需設備清單</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setActiveTab("manage")}
        >
          <Edit className="h-4 w-4 mr-2" />
          管理流程
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">流程總覽</TabsTrigger>
          <TabsTrigger value="manage">管理測試項目</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      {/* Overview Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>測試流程總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            {stations.map((station, index) => (
              <div key={station.id} className="flex flex-col items-center flex-1">
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getStationColor(station.station_order)}`}>
                  {getStationIcon(station.station_name)}
                </div>
                <div className="text-sm font-medium mt-2">{station.station_name}</div>
                <div className="text-xs text-muted-foreground">{getCalculatedStationHours(station.id)}h</div>
                {index < stations.length - 1 && (
                  <div className="absolute h-0.5 bg-border" style={{
                    left: `${(index + 1) * (100 / stations.length)}%`,
                    width: `${100 / stations.length}%`,
                    top: '24px'
                  }} />
                )}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">40</div>
              <div className="text-sm text-muted-foreground">測試系統總數</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {stations.reduce((total, station) => {
                  const calculatedHours = parseFloat(getCalculatedStationHours(station.id));
                  return total + calculatedHours;
                }, 0).toFixed(1)}h
              </div>
              <div className="text-sm text-muted-foreground">單機總測試時間</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">9-10</div>
              <div className="text-sm text-muted-foreground">預計完成天數</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Station Information */}
      <div className="space-y-6">
        {stations.map((station) => {
          const stationItems = items.filter(item => item.station_id === station.id);
          const stationDetail = getDetailedDescription(station.station_name);
          
          return (
            <Card key={station.id} className="overflow-hidden">
              <CardHeader className={`${getStationColor(station.station_order)} border-b`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStationIcon(station.station_name)}
                    <div>
                      <CardTitle className="text-xl">{station.station_name}</CardTitle>
                      <p className="text-sm opacity-90">{station.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-white/80">
                      <Clock className="h-3 w-3 mr-1" />
                      {getCalculatedStationHours(station.id)}h
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left Column - Test Items */}
                  <div>
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      測試項目
                    </h4>
                    <div className="space-y-3">
                      {stationItems.map((item) => (
                        <div key={item.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium">{item.item_name}</h5>
                            <Badge variant="outline" className="text-xs">
                              {item.estimated_minutes}min
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column - Station Details */}
                  <div>
                    <h4 className="font-semibold mb-4">站點詳細資訊</h4>
                    <div className="space-y-4">
                      <div>
                        <h5 className="text-sm font-medium text-muted-foreground mb-2">目的</h5>
                        <p className="text-sm">{stationDetail.purpose}</p>
                      </div>
                      
                      {stationDetail.procedures && stationDetail.procedures.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-2">測試程序</h5>
                          <div className="space-y-1">
                            {stationDetail.procedures.map((procedure, index) => (
                              <div key={index} className="text-sm bg-muted/30 p-2 rounded flex items-start gap-2">
                                <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0">{index + 1}.</span>
                                <span>{procedure}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {stationDetail.equipment.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-2">所需設備</h5>
                          <div className="flex flex-wrap gap-1">
                            {stationDetail.equipment.map((equipment, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {equipment}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {stationDetail.notes && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-2">備註</h5>
                          <p className="text-sm bg-muted/50 p-3 rounded">{stationDetail.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>整體測試時程總結</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-lg font-bold">Station 0-1</div>
                <div className="text-sm text-muted-foreground">組裝 + 上電</div>
                <div className="text-xs text-muted-foreground mt-1">約 6 台/天</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-lg font-bold">Station 2-3</div>
                <div className="text-sm text-muted-foreground">韌體 + 功能驗證</div>
                <div className="text-xs text-muted-foreground mt-1">約 6 台/天</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-lg font-bold">Station 4</div>
                <div className="text-sm text-muted-foreground">NV Diag 測試</div>
                <div className="text-xs text-muted-foreground mt-1">約 4 台/天</div>
              </div>
              <div className="text-center p-4 border rounded-lg bg-primary/5">
                <div className="text-lg font-bold text-primary">總計</div>
                <div className="text-sm text-muted-foreground">完整流程</div>
                <div className="text-xs text-muted-foreground mt-1">9-10 天</div>
              </div>
            </div>
            
            <Separator />
            
            <div className="text-sm text-muted-foreground">
              <p><strong>注意事項：</strong></p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>若含 Diag 驗證流程，整體需約 9 ~ 10 天完成全站流程</li>
                <li>各站點需要相應的技術支援人員配合</li>
                <li>設備數量可能影響實際產能，請確認設備充足性</li>
                <li>Station 4 為瓶頸站點，建議增加設備或人力配置</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="manage">
          <TestItemManager 
            stations={stations} 
            items={items} 
            onDataChange={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}