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
          'Chassis assembly（機殼組裝）',
          'ME assembly（機構組裝）',
          'Cable routing（線束佈線）',
          'Tim Curing for 60 minutes（加熱至 65°C 並保持 60 分鐘）',
          'Boot EGC / BMC network with NV to power on GB300',
          'SIT will help to release OS on M.2 then EE will copy the OS for 20 systems',
          'CDU setup needs thermal team help',
          'PCIe label to identify the System No.',
          'Check Open/short before power on, and take note that M.2 to copy OS at same time',
          'Make sure can boot up to uefi shell',
          'pci to display PCIe device',
          'EE: Power on, Copy M.2 OS ME/MI support if need to re-assembly'
        ],
        equipment: [
          'Monitor*2', 'Keyboard & mouse: *2', 'CR2032*20', 'MiniDP to VGA dongle*2', 
          'USB hub w/RJ45*2', 'linking board*2', 'PSU *4', 'multi-meter *2',
          'RJ45 cable as long as possible(10M)*4', 'VGA cable *1', 'CX-8 loopback cable*3',
          'BF-3 loopback cable*2'
        ],
        notes: '3.5 hr per system, 140 hr total, MFG one day / 6 system'
      };
    }
    if (stationName.includes('BIOS') || stationName.includes('Station 1')) {
      return {
        purpose: 'Power on (BIOS/BMC TEAM)',
        procedures: [
          'Power on',
          'SIT will help to release OS on M.2 then EE will copy the OS for 20 systems',
          'CDU setup needs thermal team help',
          'PCIe label to identify the System No.',
          'Check Open/short before power on, and take note that M.2 to copy OS at same time',
          'Make sure can boot up to uefi shell',
          'pci to display PCIe device',
          'BIOS / BMC : Update FW',
          'EE/ME/MI/Thermal: support if need to re-assembly or debug'
        ],
        equipment: [
          'Monitor*2', 'Keyboard & mouse: *2', 'MiniDP to VGA dongle*2',
          'USB hub w/RJ45*2', 'linking board*2', 'PSU *4', 'multi-meter *2',
          'VGA cable *2'
        ],
        notes: '1 / 1.5 hr per system + 5 hr setup CDU'
      };
    }
    if (stationName.includes('EE') || stationName.includes('Station 2')) {
      return {
        purpose: 'FW Update (EE TEAM)',
        procedures: [
          'HMC/BMC/EROT/GPU/CX8 BF3 FW update',
          'Diag auto update exclude BF3& CX8',
          'BF3 & CX8 FW update',
          'Manual update all FW if diag not support',
          'Install script for BF3/E1.5',
          'FRU update',
          'MAC update BMC/I210',
          'EE: Check all function ready',
          'Thermal/ME/MI support if need to re-assembly'
        ],
        equipment: [
          'Monitor*1', 'Keyboard & mouse: *1', 'MiniDP to VGA dongle*1',
          'USB hub w/RJ45*1', 'linking board*1', 'PSU *2'
        ],
        notes: 'GB200 ready (exclude CX8, BF3), GB200 1hrs for BIOS/BMC update (no BF3, CX7), 1 / 1.0 hr'
      };
    }
    if (stationName.includes('SIT') || stationName.includes('Station 3')) {
      return {
        purpose: 'Function Check (SIT/RAD TEAM)',
        procedures: [
          'lspci check PCIe devices',
          'nvidia-smi check GPU device status',
          'Insert and unplug detect for CX7/CX8',
          'Use ibstat and ibstat -l/more for IB connection',
          'TPM check',
          'Check Intel I210 MAC and function',
          'Run Diag SFT test',
          'QR to check Video, LED, button manually',
          'Program and check FRU',
          'Program and check MAC address',
          'Check FW',
          'Check CPU, DIMM, Disk, PCIe(include CX7/BF3), USB, sensor',
          'Check Fan control, GPU device status',
          'Perform stress test on CPU, DIMM, Disk',
          'Collect UUT data, include SEL, FRU, Sensor, OS message and other specific items in CFG',
          'Set BIOS and BMC to default'
        ],
        equipment: [
          'Monitor*1', 'Keyboard & mouse: *1', 'MiniDP to VGA dongle*1',
          'USB hub w/RJ45*1', 'linking board*1', 'PSU *2',
          'RJ45 cable as long as possible(10M)*4', 'VGA cable *1',
          'CX-8 loopback cable*2', 'BF-3 loopback cable*2'
        ],
        notes: 'GB200 ready, 1.5 hr'
      };
    }
    if (stationName.includes('Station 4')) {
      return {
        purpose: 'Partner Diagnostics for GB200 NVL T2 Compute Tray (L10) & Tim Baking',
        procedures: [
          'Run Tim Baking tool',
          '20 Items:',
          '3 items will confirm with NV',
          'Inventory',
          'SXBPerfProperties',
          'ThermalMgmt',
          'ENVironmentProperties',
          'TejaCpu',
          'TejaOdm',
          'TegaDomainSweep',
          'TejaCpp',
          'TejaDrs',
          'Queuetx',
          'Sriram',
          'Bus',
          'NetworkHw NVlink',
          'PowerTest',
          'StressGables',
          'SXBPerfInterfaceTraffic',
          'WarRock',
          'SyslogErrorCheck',
          'CheckLogErrorFiles',
          'SyslogXIDCheck',
          'JournalApiCheck',
          'UbuntuWifiCheck',
          'check if log mode is on RMA user',
          'Dump log when test finished'
        ],
        equipment: [
          'Monitor*4', 'Keyboard & mouse: *4', 'MiniDP to VGA dongle*4',
          'linking board*4', 'PSU *8', 'CX-8 loopback cable*8', 'BF-3 loopback cable*8'
        ],
        notes: 'Hope ready on 7/14 for GB300, GB200 4hrs at least, 3 / 4 hr'
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