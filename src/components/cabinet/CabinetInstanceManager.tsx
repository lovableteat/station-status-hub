import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Server, 
  MapPin, 
  Users, 
  Clock, 
  Activity, 
  Settings,
  Search,
  Grid3X3,
  List,
  Edit
} from 'lucide-react';
import { CabinetEditDialog } from './CabinetEditDialog';

// 機櫃實例介面
export interface CabinetInstance {
  id: string;
  name: string;
  model: string;
  location: string;
  status: 'active' | 'maintenance' | 'offline' | 'planning';
  totalSystems: number;
  completedSystems: number;
  totalComponents: number;
  configuredComponents: number;
  assignedEngineers: string[];
  createdAt: string;
  lastUpdated: string;
  notes?: string;
}

// 生成16台機櫃的預設資料
const generateCabinetInstances = (): CabinetInstance[] => {
  const locations = [
    '廠房A-1樓-東側', '廠房A-1樓-西側', '廠房A-2樓-東側', '廠房A-2樓-西側',
    '廠房B-1樓-北側', '廠房B-1樓-南側', '廠房B-2樓-北側', '廠房B-2樓-南側',
    '廠房C-1樓-中央', '廠房C-2樓-中央', '廠房C-3樓-中央', '廠房C-地下室',
    '廠房D-1樓-入口', '廠房D-2樓-辦公', '廠房E-實驗室', '廠房F-測試區'
  ];
  
  const engineers = [
    '張工程師', '李工程師', '王工程師', '陳工程師', '林工程師', 
    '黃工程師', '吳工程師', '劉工程師', '蔡工程師', '許工程師',
    '鄭工程師', '謝工程師', '楊工程師', '周工程師', '徐工程師'
  ];

  const statuses: CabinetInstance['status'][] = ['active', 'maintenance', 'offline', 'planning'];

  return Array.from({ length: 16 }, (_, index) => {
    const cabinetNumber = String(index + 1).padStart(3, '0');
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const totalSystems = 29; // L11機櫃標準配置
    const completedSystems = randomStatus === 'active' ? 
      Math.floor(Math.random() * totalSystems) + 10 : 
      Math.floor(Math.random() * 10);
    
    return {
      id: `cabinet-${cabinetNumber}`,
      name: `L11-機櫃-${cabinetNumber}`,
      model: 'L11',
      location: locations[index],
      status: randomStatus,
      totalSystems,
      completedSystems,
      totalComponents: 29,
      configuredComponents: Math.floor(Math.random() * 29) + 15,
      assignedEngineers: [
        engineers[Math.floor(Math.random() * engineers.length)],
        engineers[Math.floor(Math.random() * engineers.length)]
      ].filter((engineer, idx, arr) => arr.indexOf(engineer) === idx), // 去重
      createdAt: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
      lastUpdated: new Date().toISOString(),
      notes: Math.random() > 0.7 ? `機櫃 ${cabinetNumber} 的特殊配置說明` : undefined
    };
  });
};

interface CabinetInstanceManagerProps {
  currentCabinetId?: string;
  onCabinetSelect: (cabinet: CabinetInstance) => void;
}

export function CabinetInstanceManager({ currentCabinetId, onCabinetSelect }: CabinetInstanceManagerProps) {
  const [cabinets, setCabinets] = useState<CabinetInstance[]>(() => {
    // 從localStorage讀取或生成新資料
    const saved = localStorage.getItem('cabinet-instances');
    return saved ? JSON.parse(saved) : generateCabinetInstances();
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCabinet, setSelectedCabinet] = useState<string>(currentCabinetId || 'cabinet-001');
  const [editingCabinet, setEditingCabinet] = useState<CabinetInstance | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // 保存機櫃資料到localStorage
  useEffect(() => {
    localStorage.setItem('cabinet-instances', JSON.stringify(cabinets));
  }, [cabinets]);

  // 編輯機櫃
  const handleEditCabinet = (cabinet: CabinetInstance) => {
    setEditingCabinet(cabinet);
    setIsEditDialogOpen(true);
  };

  // 保存編輯的機櫃
  const handleSaveCabinet = (updatedCabinet: CabinetInstance) => {
    setCabinets(prevCabinets => 
      prevCabinets.map(cabinet => 
        cabinet.id === updatedCabinet.id ? updatedCabinet : cabinet
      )
    );
    setIsEditDialogOpen(false);
    setEditingCabinet(null);
  };

  // 篩選機櫃
  const filteredCabinets = cabinets.filter(cabinet => {
    const matchesSearch = cabinet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cabinet.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || cabinet.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // 計算機櫃進度 - 基於組裝清單中已配置的機台數量
  const calculateCabinetProgress = (cabinet: CabinetInstance) => {
    // 從localStorage讀取機櫃的組裝清單分配情況
    const allocationsKey = `global-system-allocations`;
    const savedAllocations = localStorage.getItem(allocationsKey);
    const allocations = savedAllocations ? JSON.parse(savedAllocations) : [];
    
    // 計算該機櫃已分配的機台數量
    const cabinetAllocations = allocations.filter((allocation: any) => allocation.cabinetId === cabinet.id);
    const allocatedSystemCount = cabinetAllocations.length;
    
    // 從機櫃配置讀取總組件數量作為滿配標準
    const configKey = `l11-cabinet-config-${cabinet.id}`;
    const savedConfig = localStorage.getItem(configKey);
    const config = savedConfig ? JSON.parse(savedConfig) : null;
    
    // 計算總組件數量（組裝清單中的總配置數量）
    const totalComponents = config ? 
      Object.values(config).reduce((sum: number, comp: any) => sum + (comp.count || 0), 0) : 
      cabinet.totalComponents;
    
    // 確保totalComponents是有效數字，避免除零錯誤
    const validTotalComponents = Math.max(1, Number(totalComponents) || 1);
    
    // 進度 = 已分配機台數量 / 總組件數量 * 100
    return Math.min(100, Math.round((allocatedSystemCount / validTotalComponents) * 100));
  };

  const handleCabinetSelect = (cabinetId: string) => {
    // 防止重複選擇造成的不必要更新
    if (selectedCabinet === cabinetId) return;
    
    setSelectedCabinet(cabinetId);
    const cabinet = cabinets.find(c => c.id === cabinetId);
    if (cabinet) {
      onCabinetSelect(cabinet);
    }
  };

  const getStatusColor = (status: CabinetInstance['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'maintenance': return 'bg-yellow-500';
      case 'offline': return 'bg-red-500';
      case 'planning': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: CabinetInstance['status']) => {
    switch (status) {
      case 'active': return '運行中';
      case 'maintenance': return '維護中';
      case 'offline': return '離線';
      case 'planning': return '規劃中';
      default: return '未知';
    }
  };

  const currentCabinet = cabinets.find(c => c.id === selectedCabinet);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            機櫃管理中心 ({filteredCabinets.length}/16)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* 篩選控制 */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="搜尋機櫃名稱或位置..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="篩選狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="active">運行中</SelectItem>
              <SelectItem value="maintenance">維護中</SelectItem>
              <SelectItem value="offline">離線</SelectItem>
              <SelectItem value="planning">規劃中</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* 當前選中的機櫃詳情 */}
        {currentCabinet && (
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                  <h4 className="font-semibold">當前機櫃: {currentCabinet.name}</h4>
                </div>
                <Badge className={getStatusColor(currentCabinet.status)}>
                  {getStatusText(currentCabinet.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{currentCabinet.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span>{currentCabinet.completedSystems}/{currentCabinet.totalSystems} 系統</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span>{currentCabinet.completedSystems}/{currentCabinet.totalSystems} 系統</span>
                </div>
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>{currentCabinet.configuredComponents}/{currentCabinet.totalComponents} 組件</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* 機櫃列表/網格 */}
        <div className={
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-2"
        }>
          {filteredCabinets.map((cabinet) => {
            const isSelected = cabinet.id === selectedCabinet;
            const progressPercent = calculateCabinetProgress(cabinet);
            
            return (
              <Card
                key={cabinet.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
                } ${viewMode === 'list' ? 'p-3' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleCabinetSelect(cabinet.id);
                }}
              >
                {viewMode === 'grid' ? (
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{cabinet.name}</h4>
                        <Badge 
                          variant="secondary"
                          className={`${getStatusColor(cabinet.status)} text-white text-xs`}
                        >
                          {getStatusText(cabinet.status)}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{cabinet.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          <span>進度: {progressPercent}%</span>
                        </div>
                         <div className="flex gap-1 mt-2">
                           <Button 
                             variant="outline" 
                             size="sm" 
                             className="h-6 text-xs flex-1"
                             onClick={(e) => {
                               e.stopPropagation();
                               handleEditCabinet(cabinet);
                             }}
                           >
                             <Edit className="h-3 w-3 mr-1" />
                             編輯
                           </Button>
                         </div>
                      </div>
                      
                      {/* 進度條 */}
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                ) : (
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${getStatusColor(cabinet.status)}`} />
                        <span className="font-medium">{cabinet.name}</span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        {cabinet.location}
                      </div>
                      
                      <div className="text-sm">
                        {progressPercent}% 完成
                      </div>
                    </div>
                     
                     <div className="flex items-center gap-2">
                       <Button 
                         variant="outline" 
                         size="sm" 
                         className="h-6 text-xs"
                         onClick={(e) => {
                           e.stopPropagation();
                           handleEditCabinet(cabinet);
                         }}
                       >
                         <Edit className="h-3 w-3 mr-1" />
                         編輯
                       </Button>
                     </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        
        {filteredCabinets.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>沒有找到符合條件的機櫃</p>
          </div>
        )}
      </CardContent>

      {/* 編輯對話框 */}
      <CabinetEditDialog 
        cabinet={editingCabinet}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSave={handleSaveCabinet}
      />
    </Card>
  );
}

// 導出機櫃實例類型供其他組件使用