
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestProgressTable } from "./TestProgressTable";
import { FilterControls } from "./FilterControls";
import { TestManagementPanel } from "./TestManagementPanel";
import { FlowOverview } from "./FlowOverview";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";

export function TestTracker() {
  const { systems, stations, items, progress, loadData, updateProgress } = useTestTrackerData();
  
  const [filteredSystems, setFilteredSystems] = useState(systems);
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    status: 'Not Start',
    progress_percent: 0,
    notes: '',
    started_at: '',
    completed_at: ''
  });

  // Filter states for FilterControls
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEngineer, setFilterEngineer] = useState('all-engineers');
  const [filterStatus, setFilterStatus] = useState('all-status');

  // Get unique engineers from systems
  const engineers = Array.from(new Set(systems.map(s => s.assigned_engineer).filter(Boolean)));

  // Get current tab from URL params
  const [currentTab, setCurrentTab] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tab') || 'overview';
  });

  useEffect(() => {
    setFilteredSystems(systems);
  }, [systems]);

  useEffect(() => {
    // Listen for navigation events
    const handleNavigation = (event: CustomEvent) => {
      if (event.detail?.module === 'overview') {
        setCurrentTab('overview');
      }
    };

    window.addEventListener('navigate', handleNavigation as EventListener);
    return () => {
      window.removeEventListener('navigate', handleNavigation as EventListener);
    };
  }, []);

  // Apply filters to systems
  useEffect(() => {
    let filtered = systems;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(system => 
        system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (system.assigned_engineer && system.assigned_engineer.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply engineer filter
    if (filterEngineer !== 'all-engineers') {
      filtered = filtered.filter(system => system.assigned_engineer === filterEngineer);
    }

    // Apply status filter
    if (filterStatus !== 'all-status') {
      filtered = filtered.filter(system => system.status === filterStatus);
    }

    setFilteredSystems(filtered);
  }, [systems, searchTerm, filterEngineer, filterStatus]);

  const getProgressForSystemItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const handleEditProgress = (systemId: string, stationId: string, itemId: string) => {
    const existing = getProgressForSystemItem(systemId, stationId, itemId);
    if (existing) {
      setEditValues({
        status: existing.status || 'Not Start',
        progress_percent: existing.progress_percent || 0,
        notes: existing.notes || '',
        started_at: existing.started_at || '',
        completed_at: existing.completed_at || ''
      });
    } else {
      setEditValues({
        status: 'Not Start',
        progress_percent: 0,
        notes: '',
        started_at: '',
        completed_at: ''
      });
    }
    setEditingProgress(`${systemId}-${stationId}-${itemId}`);
  };

  const handleSaveProgress = async (systemId: string, stationId: string, itemId: string) => {
    const success = await updateProgress(systemId, stationId, itemId, {
      status: editValues.status,
      progress_percent: editValues.progress_percent,
      notes: editValues.notes,
      started_at: editValues.started_at || null,
      completed_at: editValues.completed_at || null
    });

    if (success) {
      setEditingProgress(null);
      await loadData();
    }
  };

  const handleDeleteProgress = async (systemId: string, stationId: string, itemId: string) => {
    // Implementation for deleting progress
    console.log('Delete progress for:', systemId, stationId, itemId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'text-green-600';
      case 'On-going': return 'text-blue-600';
      case 'Not Start': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const handleTabChange = (value: string) => {
    setCurrentTab(value);
    const url = new URL(window.location.href);
    if (value === 'overview') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', value);
    }
    window.history.pushState({}, '', url.toString());
  };

  return (
    <div className="space-y-6">
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">流程總覽</TabsTrigger>
          <TabsTrigger value="management">管理測試項目</TabsTrigger>
          <TabsTrigger value="tracker">測試追蹤</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <FlowOverview />
        </TabsContent>

        <TabsContent value="management">
          <TestManagementPanel />
        </TabsContent>

        <TabsContent value="tracker" className="space-y-6">
          <FilterControls 
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterEngineer={filterEngineer}
            setFilterEngineer={setFilterEngineer}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            engineers={engineers}
          />
          
          <TestProgressTable
            filteredSystems={filteredSystems}
            stations={stations}
            items={items}
            progress={progress}
            editingProgress={editingProgress}
            setEditingProgress={setEditingProgress}
            editValues={editValues}
            setEditValues={setEditValues}
            getProgressForSystemItem={getProgressForSystemItem}
            handleEditProgress={handleEditProgress}
            handleSaveProgress={handleSaveProgress}
            handleDeleteProgress={handleDeleteProgress}
            getStatusColor={getStatusColor}
            onSystemUpdate={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
