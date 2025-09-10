import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Search, 
  Filter, 
  LayoutGrid, 
  List,
  Building,
  Activity,
  Users,
  Settings
} from 'lucide-react';
import { CabinetCard, CabinetInfo } from './CabinetCard';
import { CabinetCreateDialog } from './CabinetCreateDialog';
import { CabinetEditDialog } from './CabinetEditDialog';
import { BackButton } from '@/components/common/BackButton';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useNavigate } from 'react-router-dom';

// 模擬機櫃數據
const generateMockCabinets = (): CabinetInfo[] => {
  return [
    {
      id: 'cabinet-001',
      name: 'L11-機櫃-A1',
      location: '廠房A-1樓-東側',
      model: 'L11',
      status: 'active',
      totalSystems: 29,
      completedSystems: 18,
      totalComponents: 29,
      configuredComponents: 25,
      assignedEngineers: ['張工程師', '李工程師', '王工程師'],
      createdAt: '2024-01-15T08:00:00Z',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'cabinet-002', 
      name: 'L11-機櫃-A2',
      location: '廠房A-1樓-西側',
      model: 'L11',
      status: 'maintenance',
      totalSystems: 29,
      completedSystems: 12,
      totalComponents: 29,
      configuredComponents: 20,
      assignedEngineers: ['陳工程師', '林工程師'],
      createdAt: '2024-01-20T09:30:00Z',
      lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'cabinet-003',
      name: 'L11-機櫃-B1', 
      location: '廠房B-2樓-北側',
      model: 'L11',
      status: 'planning',
      totalSystems: 29,
      completedSystems: 0,
      totalComponents: 29,
      configuredComponents: 8,
      assignedEngineers: ['黃工程師'],
      createdAt: '2024-02-01T10:15:00Z',
      lastUpdated: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'cabinet-004',
      name: 'L11-機櫃-B2',
      location: '廠房B-2樓-南側', 
      model: 'L11',
      status: 'offline',
      totalSystems: 29,
      completedSystems: 8,
      totalComponents: 29,
      configuredComponents: 15,
      assignedEngineers: [],
      createdAt: '2024-02-05T14:20:00Z',
      lastUpdated: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'cabinet-005',
      name: 'L11-機櫃-C1',
      location: '廠房C-3樓-中央',
      model: 'L11', 
      status: 'active',
      totalSystems: 29,
      completedSystems: 29,
      totalComponents: 29,
      configuredComponents: 29,
      assignedEngineers: ['劉工程師', '吳工程師', '蔡工程師', '鄭工程師'],
      createdAt: '2024-01-10T07:45:00Z',
      lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    }
  ];
};

export function CabinetManagement() {
  const { systems } = useUnifiedData();
  const navigate = useNavigate();
  const [cabinets, setCabinets] = useState<CabinetInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editingCabinet, setEditingCabinet] = useState<CabinetInfo | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // 從localStorage載入機櫃數據
  const loadCabinetsFromStorage = (): CabinetInfo[] => {
    try {
      const savedCabinets = localStorage.getItem('cabinet-management-data');
      if (savedCabinets) {
        return JSON.parse(savedCabinets);
      }
    } catch (error) {
      console.warn('Failed to load cabinets from localStorage:', error);
    }
    // 如果沒有保存的數據，使用默認數據
    return generateMockCabinets();
  };

  // 保存機櫃數據到localStorage
  const saveCabinetsToStorage = (cabinetsData: CabinetInfo[]) => {
    try {
      localStorage.setItem('cabinet-management-data', JSON.stringify(cabinetsData));
    } catch (error) {
      console.warn('Failed to save cabinets to localStorage:', error);
    }
  };

  useEffect(() => {
    // 載入機櫃數據
    const loadedCabinets = loadCabinetsFromStorage();
    setCabinets(loadedCabinets);
  }, []);

  const filteredCabinets = cabinets.filter(cabinet => {
    const matchesSearch = cabinet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cabinet.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || cabinet.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const totalSystems = cabinets.reduce((sum, cabinet) => sum + cabinet.totalSystems, 0);
  const totalCompleted = cabinets.reduce((sum, cabinet) => sum + cabinet.completedSystems, 0);
  const totalComponents = cabinets.reduce((sum, cabinet) => sum + cabinet.totalComponents, 0);
  const totalConfigured = cabinets.reduce((sum, cabinet) => sum + cabinet.configuredComponents, 0);

  const statusCounts = {
    active: cabinets.filter(c => c.status === 'active').length,
    maintenance: cabinets.filter(c => c.status === 'maintenance').length,
    offline: cabinets.filter(c => c.status === 'offline').length,
    planning: cabinets.filter(c => c.status === 'planning').length
  };

  const handleCreateCabinet = (cabinetData: Omit<CabinetInfo, 'id' | 'createdAt' | 'lastUpdated'>) => {
    const newCabinet: CabinetInfo = {
      ...cabinetData,
      id: `cabinet-${Date.now().toString().slice(-6)}`,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    const updatedCabinets = [...cabinets, newCabinet];
    setCabinets(updatedCabinets);
    saveCabinetsToStorage(updatedCabinets);
  };

  const handleEditCabinet = (cabinet: CabinetInfo) => {
    setEditingCabinet(cabinet);
    setEditDialogOpen(true);
  };

  const handleSaveCabinet = (updatedCabinet: CabinetInfo) => {
    const updatedCabinets = cabinets.map(c => c.id === updatedCabinet.id ? updatedCabinet : c);
    setCabinets(updatedCabinets);
    saveCabinetsToStorage(updatedCabinets);
  };

  const handleDeleteCabinet = (cabinetId: string) => {
    if (confirm('確定要刪除此機櫃嗎？此操作無法撤銷。')) {
      const updatedCabinets = cabinets.filter(c => c.id !== cabinetId);
      setCabinets(updatedCabinets);
      saveCabinetsToStorage(updatedCabinets);
      
      // 同時清理該機櫃的相關數據
      localStorage.removeItem(`l11-cabinet-config-${cabinetId}`);
      localStorage.removeItem(`l11-cabinet-componentSystemMapping-${cabinetId}`);
      localStorage.removeItem(`l11-cabinet-autoRotate-${cabinetId}`);
      localStorage.removeItem(`l11-cabinet-isOpen-${cabinetId}`);
      localStorage.removeItem(`l11-cabinet-selectedComponent-${cabinetId}`);
    }
  };

  const handleViewDetails = (cabinetId: string) => {
    navigate(`/cabinet/${cabinetId}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 標題區域 */}
      <div className="flex items-center justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-foreground mt-2">GB300機櫃測試追蹤</h1>
          <p className="text-muted-foreground">管理和監控所有機櫃的測試進度與配置狀態</p>
        </div>
        
        <CabinetCreateDialog onCreateCabinet={handleCreateCabinet} />
      </div>

      {/* 總覽統計 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總機櫃數</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cabinets.length}</div>
            <p className="text-xs text-muted-foreground">
              運行中: {statusCounts.active} | 維護中: {statusCounts.maintenance}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">系統完成率</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalSystems > 0 ? ((totalCompleted / totalSystems) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {totalCompleted} / {totalSystems} 系統
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">組件配置率</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalComponents > 0 ? ((totalConfigured / totalComponents) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {totalConfigured} / {totalComponents} 組件
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活躍工程師</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(cabinets.flatMap(c => c.assignedEngineers)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              跨 {cabinets.filter(c => c.assignedEngineers.length > 0).length} 個機櫃
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 篩選和搜尋 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex gap-4 items-center flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋機櫃名稱或位置..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
                <TabsList>
                  <TabsTrigger value="all">全部</TabsTrigger>
                  <TabsTrigger value="active">運行中</TabsTrigger>
                  <TabsTrigger value="maintenance">維護中</TabsTrigger>
                  <TabsTrigger value="offline">離線</TabsTrigger>
                  <TabsTrigger value="planning">規劃中</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex gap-2">
              <Button 
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
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
        </CardContent>
      </Card>

      {/* 機櫃列表 */}
      <div className={
        viewMode === 'grid' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
          : 'space-y-4'
      }>
        {filteredCabinets.map((cabinet) => (
          <CabinetCard
            key={cabinet.id}
            cabinet={cabinet}
            onEdit={handleEditCabinet}
            onDelete={handleDeleteCabinet}
            onViewDetails={handleViewDetails}
          />
        ))}
      </div>

      {filteredCabinets.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">找不到符合條件的機櫃</h3>
            <p className="text-muted-foreground mb-4">
              請調整搜尋條件或狀態篩選器
            </p>
            <Button onClick={() => { setSearchTerm(''); setSelectedStatus('all'); }}>
              清除篩選條件
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <CabinetEditDialog
        cabinet={editingCabinet}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveCabinet}
      />
    </div>
  );
}