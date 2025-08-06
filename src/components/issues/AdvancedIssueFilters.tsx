import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Filter, 
  X, 
  CalendarIcon, 
  ChevronDown,
  Trash2,
  RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface FilterState {
  searchTerm: string;
  priorities: string[];
  statuses: string[];
  assignees: string[];
  systems: string[];
  stations: string[];
  categories: string[];
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
}

interface AdvancedIssueFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
  issueCount: number;
  filteredCount: number;
}

export function AdvancedIssueFilters({ 
  onFiltersChange, 
  issueCount, 
  filteredCount 
}: AdvancedIssueFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: "",
    priorities: [],
    statuses: [],
    assignees: [],
    systems: [],
    stations: [],
    categories: [],
    dateRange: { from: undefined, to: undefined }
  });

  // 動態選項數據
  const [assigneeOptions, setAssigneeOptions] = useState<string[]>([]);
  const [systemOptions, setSystemOptions] = useState<string[]>([]);
  const [stationOptions, setStationOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  const priorityOptions = [
    { value: "low", label: "低", color: "bg-green-100 text-green-700 border-green-200" },
    { value: "medium", label: "中", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { value: "high", label: "高", color: "bg-orange-100 text-orange-700 border-orange-200" },
    { value: "critical", label: "緊急", color: "bg-red-100 text-red-700 border-red-200" }
  ];

  const statusOptions = [
    { value: "open", label: "待處理", color: "bg-red-100 text-red-700 border-red-200" },
    { value: "in_progress", label: "處理中", color: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "resolved", label: "已解決", color: "bg-green-100 text-green-700 border-green-200" },
    { value: "closed", label: "已關閉", color: "bg-gray-100 text-gray-700 border-gray-200" }
  ];

  // 載入動態選項
  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      // 載入指派人選項
      const { data: assignees } = await supabase
        .from('issues')
        .select('assigned_to')
        .not('assigned_to', 'is', null);
      
      const uniqueAssignees = [...new Set(assignees?.map(item => item.assigned_to) || [])];
      setAssigneeOptions(uniqueAssignees.filter(Boolean));

      // 載入系統選項
      const { data: systems } = await supabase
        .from('test_systems')
        .select('system_name')
        .order('system_name');
      
      setSystemOptions(systems?.map(item => item.system_name) || []);

      // 載入工站選項
      const { data: stations } = await supabase
        .from('test_flow_stations')
        .select('station_name')
        .order('station_order');
      
      setStationOptions(stations?.map(item => item.station_name) || []);

      // 載入分類選項
      const { data: categories } = await supabase
        .from('issues')
        .select('category')
        .not('category', 'is', null);
      
      const uniqueCategories = [...new Set(categories?.map(item => item.category) || [])];
      setCategoryOptions(uniqueCategories.filter(Boolean));
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  // 更新篩選器並通知父組件
  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  // 清除所有篩選器
  const clearAllFilters = () => {
    const emptyFilters: FilterState = {
      searchTerm: "",
      priorities: [],
      statuses: [],
      assignees: [],
      systems: [],
      stations: [],
      categories: [],
      dateRange: { from: undefined, to: undefined }
    };
    setFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  // 切換多選項目
  const toggleArrayItem = (array: string[], item: string) => {
    return array.includes(item) 
      ? array.filter(i => i !== item)
      : [...array, item];
  };

  // 移除單個篩選標籤
  const removeFilter = (type: keyof FilterState, value?: string) => {
    if (type === 'searchTerm') {
      updateFilters({ searchTerm: "" });
    } else if (type === 'dateRange') {
      updateFilters({ dateRange: { from: undefined, to: undefined } });
    } else if (Array.isArray(filters[type]) && value) {
      const array = filters[type] as string[];
      updateFilters({ [type]: array.filter(item => item !== value) });
    }
  };

  // 獲取已應用的篩選標籤
  const getActiveFilterTags = () => {
    const tags: Array<{ type: keyof FilterState; value: string; label: string }> = [];
    
    // 搜尋詞
    if (filters.searchTerm) {
      tags.push({ type: 'searchTerm', value: '', label: `搜尋: ${filters.searchTerm}` });
    }

    // 優先級
    filters.priorities.forEach(priority => {
      const option = priorityOptions.find(opt => opt.value === priority);
      tags.push({ 
        type: 'priorities', 
        value: priority, 
        label: `優先級: ${option?.label || priority}` 
      });
    });

    // 狀態
    filters.statuses.forEach(status => {
      const option = statusOptions.find(opt => opt.value === status);
      tags.push({ 
        type: 'statuses', 
        value: status, 
        label: `狀態: ${option?.label || status}` 
      });
    });

    // 指派人
    filters.assignees.forEach(assignee => {
      tags.push({ type: 'assignees', value: assignee, label: `指派給: ${assignee}` });
    });

    // 系統
    filters.systems.forEach(system => {
      tags.push({ type: 'systems', value: system, label: `系統: ${system}` });
    });

    // 工站
    filters.stations.forEach(station => {
      tags.push({ type: 'stations', value: station, label: `工站: ${station}` });
    });

    // 分類
    filters.categories.forEach(category => {
      tags.push({ type: 'categories', value: category, label: `分類: ${category}` });
    });

    // 日期範圍
    if (filters.dateRange.from || filters.dateRange.to) {
      const fromStr = filters.dateRange.from ? format(filters.dateRange.from, 'yyyy/MM/dd') : '開始';
      const toStr = filters.dateRange.to ? format(filters.dateRange.to, 'yyyy/MM/dd') : '結束';
      tags.push({ 
        type: 'dateRange', 
        value: '', 
        label: `日期: ${fromStr} ~ ${toStr}` 
      });
    }

    return tags;
  };

  const activeFilterTags = getActiveFilterTags();
  const hasActiveFilters = activeFilterTags.length > 0;

  return (
    <div className="space-y-4">
      {/* 主要篩選列 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-center">
            {/* 搜尋框 */}
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋問題標題、描述、系統或工站..."
                  value={filters.searchTerm}
                  onChange={(e) => updateFilters({ searchTerm: e.target.value.trim().slice(0, 100) })}
                  className="pl-10 pr-10"
                />
                {filters.searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => updateFilters({ searchTerm: "" })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* 快速篩選 */}
            <Select value={filters.priorities[0] || ""} onValueChange={(value) => 
              updateFilters({ priorities: value ? [value] : [] })
            }>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="優先級" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部優先級</SelectItem>
                {priorityOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.statuses[0] || ""} onValueChange={(value) => 
              updateFilters({ statuses: value ? [value] : [] })
            }>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部狀態</SelectItem>
                {statusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 高級篩選按鈕 */}
            <Button
              variant="outline"
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn("gap-2", hasActiveFilters && "border-primary")}
            >
              <Filter className="h-4 w-4" />
              高級篩選
              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {activeFilterTags.length}
                </Badge>
              )}
            </Button>

            {/* 清除篩選按鈕 */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
                清除篩選
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 高級篩選面板 */}
      {isExpanded && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">高級篩選設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 優先級 */}
              <div>
                <Label className="text-base font-medium mb-3 block">優先級</Label>
                <div className="space-y-2">
                  {priorityOptions.map(option => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`priority-${option.value}`}
                        checked={filters.priorities.includes(option.value)}
                        onCheckedChange={() => 
                          updateFilters({ 
                            priorities: toggleArrayItem(filters.priorities, option.value) 
                          })
                        }
                      />
                      <Label
                        htmlFor={`priority-${option.value}`}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className={cn("px-2 py-1 rounded text-xs border", option.color)}>
                          {option.label}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 狀態 */}
              <div>
                <Label className="text-base font-medium mb-3 block">狀態</Label>
                <div className="space-y-2">
                  {statusOptions.map(option => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${option.value}`}
                        checked={filters.statuses.includes(option.value)}
                        onCheckedChange={() => 
                          updateFilters({ 
                            statuses: toggleArrayItem(filters.statuses, option.value) 
                          })
                        }
                      />
                      <Label
                        htmlFor={`status-${option.value}`}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className={cn("px-2 py-1 rounded text-xs border", option.color)}>
                          {option.label}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 指派人 */}
              <div>
                <Label className="text-base font-medium mb-3 block">指派人</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {assigneeOptions.map(assignee => (
                    <div key={assignee} className="flex items-center space-x-2">
                      <Checkbox
                        id={`assignee-${assignee}`}
                        checked={filters.assignees.includes(assignee)}
                        onCheckedChange={() => 
                          updateFilters({ 
                            assignees: toggleArrayItem(filters.assignees, assignee) 
                          })
                        }
                      />
                      <Label
                        htmlFor={`assignee-${assignee}`}
                        className="text-sm cursor-pointer truncate"
                        title={assignee}
                      >
                        {assignee}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 系統 */}
              <div>
                <Label className="text-base font-medium mb-3 block">系統</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {systemOptions.map(system => (
                    <div key={system} className="flex items-center space-x-2">
                      <Checkbox
                        id={`system-${system}`}
                        checked={filters.systems.includes(system)}
                        onCheckedChange={() => 
                          updateFilters({ 
                            systems: toggleArrayItem(filters.systems, system) 
                          })
                        }
                      />
                      <Label
                        htmlFor={`system-${system}`}
                        className="text-sm cursor-pointer truncate"
                        title={system}
                      >
                        {system}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 工站 */}
              <div>
                <Label className="text-base font-medium mb-3 block">工站</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {stationOptions.map(station => (
                    <div key={station} className="flex items-center space-x-2">
                      <Checkbox
                        id={`station-${station}`}
                        checked={filters.stations.includes(station)}
                        onCheckedChange={() => 
                          updateFilters({ 
                            stations: toggleArrayItem(filters.stations, station) 
                          })
                        }
                      />
                      <Label
                        htmlFor={`station-${station}`}
                        className="text-sm cursor-pointer truncate"
                        title={station}
                      >
                        {station}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 日期範圍 */}
              <div>
                <Label className="text-base font-medium mb-3 block">建立日期</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filters.dateRange.from && !filters.dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateRange.from ? (
                        filters.dateRange.to ? (
                          <>
                            {format(filters.dateRange.from, "MM/dd")} -{" "}
                            {format(filters.dateRange.to, "MM/dd")}
                          </>
                        ) : (
                          format(filters.dateRange.from, "MM/dd")
                        )
                      ) : (
                        <span>選擇日期範圍</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={filters.dateRange.from}
                      selected={{
                        from: filters.dateRange.from,
                        to: filters.dateRange.to,
                      }}
                      onSelect={(range) => 
                        updateFilters({ 
                          dateRange: { 
                            from: range?.from, 
                            to: range?.to 
                          } 
                        })
                      }
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 已應用的篩選標籤 */}
      {hasActiveFilters && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  已應用篩選:
                </span>
                {activeFilterTags.map((tag, index) => (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className="gap-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={() => removeFilter(tag.type, tag.value)}
                  >
                    {tag.label}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">
                顯示 {filteredCount} / {issueCount} 個問題
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}