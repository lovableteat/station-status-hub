import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BackButton } from '@/components/common/BackButton';
import { useTestProject } from '@/components/test-projects/TestProjectProvider';
import { supabase } from '@/integrations/supabase/client';
import { Monitor, Settings, Zap, Server, Database, Network } from 'lucide-react';

interface CabinetSystem {
  id: string;
  serial_number: string;
  system_name: string;
  model: string;
  current_station: string;
  status: string;
  assigned_engineer: string;
  overall_progress: number;
  team: string;
  bmc_address?: string;
  os_mac_address?: string;
  ubuntu_version?: string;
  cuda_version?: string;
}

interface CabinetSlot {
  position: string;
  type: 'TOR' | 'PSU' | 'CT' | 'SW' | 'SRC';
  system?: CabinetSystem;
  isEmpty: boolean;
  description: string;
}

export function CabinetTestTracker() {
  const [systems, setSystems] = useState<CabinetSystem[]>([]);
  const [slots, setSlots] = useState<CabinetSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeProjectId } = useTestProject();

  useEffect(() => {
    loadSystems();
    generateSlots();
  }, [activeProjectId]);

  const loadSystems = async () => {
    try {
      if (!activeProjectId) {
        setSystems([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_systems')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('model', 'GB300')
        .order('serial_number');

      if (error) throw error;
      setSystems(data || []);
    } catch (error) {
      console.error('Error loading systems:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSlots = () => {
    const cabinetSlots: CabinetSlot[] = [
      // Top of Rack Switch
      {
        position: 'TOR-01',
        type: 'TOR',
        isEmpty: true,
        description: '頂層交換機'
      },
      
      // Top Power Supplies (4 slots)
      ...Array.from({length: 4}, (_, i) => ({
        position: `PSU-T-${String(i + 1).padStart(2, '0')}`,
        type: 'PSU' as const,
        isEmpty: true,
        description: '上層電源供應'
      })),
      
      // Compute Trays 1 (10 slots)
      ...Array.from({length: 10}, (_, i) => ({
        position: `CT1-${String(i + 1).padStart(2, '0')}`,
        type: 'CT' as const,
        isEmpty: true,
        description: '運算托盤第一組'
      })),
      
      // Switch Trays (9 slots)
      ...Array.from({length: 9}, (_, i) => ({
        position: `SW-${String(i + 1).padStart(2, '0')}`,
        type: 'SW' as const,
        isEmpty: true,
        description: '交換機托盤'
      })),
      
      // Compute Trays 2 (8 slots)
      ...Array.from({length: 8}, (_, i) => ({
        position: `CT2-${String(i + 1).padStart(2, '0')}`,
        type: 'CT' as const,
        isEmpty: true,
        description: '運算托盤第二組'
      })),
      
      // Bottom Power Supplies (4 slots)
      ...Array.from({length: 4}, (_, i) => ({
        position: `PSU-B-${String(i + 1).padStart(2, '0')}`,
        type: 'PSU' as const,
        isEmpty: true,
        description: '下層電源供應'
      })),
      
      // SRC Units (2 slots)
      ...Array.from({length: 2}, (_, i) => ({
        position: `SRC-${String(i + 1).padStart(2, '0')}`,
        type: 'SRC' as const,
        isEmpty: true,
        description: 'SRC單元'
      }))
    ];
    
    setSlots(cabinetSlots);
  };

  const getSlotIcon = (type: string) => {
    switch (type) {
      case 'TOR':
      case 'SW':
        return <Network className="h-4 w-4" />;
      case 'CT':
        return <Server className="h-4 w-4" />;
      case 'PSU':
        return <Zap className="h-4 w-4" />;
      case 'SRC':
        return <Database className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getSlotColor = (type: string) => {
    switch (type) {
      case 'TOR':
      case 'SW':
        return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';
      case 'CT':
        return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
      case 'PSU':
        return 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800';
      case 'SRC':
        return 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800';
      default:
        return 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <Badge className="bg-green-100 text-green-800">已完成</Badge>;
      case 'In Progress':
        return <Badge className="bg-blue-100 text-blue-800">進行中</Badge>;
      case 'Pending':
        return <Badge className="bg-yellow-100 text-yellow-800">待處理</Badge>;
      case 'Not Start':
        return <Badge variant="outline">未開始</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <BackButton />
            <h1 className="text-3xl font-bold text-foreground mt-2">GB300機櫃測試追蹤</h1>
            <p className="text-muted-foreground">機櫃位置與測試進度管理</p>
          </div>
        </div>
        <div className="text-center">載入中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-foreground mt-2">GB300機櫃測試追蹤</h1>
          <p className="text-muted-foreground">機櫃位置與測試進度管理</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadSystems}>
            刷新數據
          </Button>
        </div>
      </div>

      {/* 統計資訊 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{systems.length}</div>
                <div className="text-sm text-muted-foreground">總系統數</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {systems.filter(s => s.status === 'In Progress').length}
                </div>
                <div className="text-sm text-muted-foreground">進行中</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-amber-600" />
              <div>
                <div className="text-2xl font-bold text-amber-600">
                  {systems.filter(s => s.status === 'Completed').length}
                </div>
                <div className="text-sm text-muted-foreground">已完成</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-purple-600">{slots.length}</div>
                <div className="text-sm text-muted-foreground">機櫃位置</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 機櫃位置圖 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            機櫃位置配置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {slots.map((slot) => (
              <div
                key={slot.position}
                className={`p-3 border-2 rounded-lg transition-all hover:shadow-md ${getSlotColor(slot.type)} ${
                  slot.system ? 'cursor-pointer hover:scale-105' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {getSlotIcon(slot.type)}
                  <div className="text-xs font-mono font-semibold">{slot.position}</div>
                </div>
                
                <div className="text-xs text-muted-foreground mb-2">{slot.description}</div>
                
                {slot.system ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold truncate">{slot.system.system_name}</div>
                    <div className="text-xs font-mono text-yellow-600">{slot.system.serial_number}</div>
                    {getStatusBadge(slot.system.status)}
                    <Progress value={slot.system.overall_progress} className="h-1" />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">空位</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 系統詳細列表 */}
      <Card>
        <CardHeader>
          <CardTitle>系統測試狀態</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {systems.map((system) => (
              <div key={system.id} className="border rounded-lg p-4 hover:bg-accent/5 transition-colors">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <div className="font-semibold">{system.system_name}</div>
                    <div className="text-sm text-yellow-600 font-mono">{system.serial_number}</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-muted-foreground">當前工站</div>
                    <div className="font-medium">{system.current_station}</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-muted-foreground">指派工程師</div>
                    <div className="font-medium">{system.assigned_engineer || '未指派'}</div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-muted-foreground">進度</div>
                    <div className="flex items-center gap-2">
                      <Progress value={system.overall_progress} className="flex-1" />
                      <span className="text-sm font-medium">{system.overall_progress}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    {getStatusBadge(system.status)}
                  </div>
                </div>
                
                {(system.bmc_address || system.os_mac_address) && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {system.bmc_address && (
                      <div>
                        <span className="text-muted-foreground">BMC: </span>
                        <span className="font-mono">{system.bmc_address}</span>
                      </div>
                    )}
                    {system.os_mac_address && (
                      <div>
                        <span className="text-muted-foreground">NIC MAC: </span>
                        <span className="font-mono">{system.os_mac_address}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {systems.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              目前沒有GB300系統數據
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
