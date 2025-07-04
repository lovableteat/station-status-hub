import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";

interface TestRecord {
  id: string;
  system_name: string;
  station_name: string;
  test_item: string;
  status: string;
  progress: number;
  assigned_engineer: string;
  start_date: string;
  completion_date?: string;
  notes?: string;
}

interface CollapsibleTestRecordsProps {
  records: TestRecord[];
  getStatusColor: (status: string) => string;
}

export function CollapsibleTestRecords({ records, getStatusColor }: CollapsibleTestRecordsProps) {
  const { systems, stations, testItems, progress } = useUnifiedData();
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

  // Group records by system
  const groupedRecords = records.reduce((acc, record) => {
    if (!acc[record.system_name]) {
      acc[record.system_name] = [];
    }
    acc[record.system_name].push(record);
    return acc;
  }, {} as Record<string, TestRecord[]>);

  const toggleSystemExpanded = (systemName: string) => {
    const newExpanded = new Set(expandedSystems);
    if (newExpanded.has(systemName)) {
      newExpanded.delete(systemName);
    } else {
      newExpanded.add(systemName);
    }
    setExpandedSystems(newExpanded);
  };

  const getSystemSummary = (systemName: string) => {
    const systemRecords = groupedRecords[systemName];
    const completedItems = systemRecords.filter(r => r.status === 'Done').length;
    const ongoingItems = systemRecords.filter(r => r.status === 'On-going').length;
    const totalItems = systemRecords.length;
    const overallProgress = Math.round((completedItems / totalItems) * 100);
    
    return {
      completed: completedItems,
      ongoing: ongoingItems,
      total: totalItems,
      progress: overallProgress,
      assignedEngineer: systemRecords[0]?.assigned_engineer || 'Unassigned'
    };
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>系統編號</TableHead>
            <TableHead>負責工程師</TableHead>
            <TableHead>總進度</TableHead>
            <TableHead>已完成/總項目</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.keys(groupedRecords).map((systemName) => {
            const summary = getSystemSummary(systemName);
            const isExpanded = expandedSystems.has(systemName);
            
            return (
              <>
                <TableRow key={systemName} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSystemExpanded(systemName)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">{systemName}</TableCell>
                  <TableCell>{summary.assignedEngineer}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${summary.progress}%` }}
                        />
                      </div>
                      <span className="text-sm">{summary.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">
                        {summary.completed}/{summary.total}
                      </Badge>
                      {summary.ongoing > 0 && (
                        <Badge className="bg-warning text-warning-foreground text-xs">
                          {summary.ongoing} 進行中
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <Card className="mx-4 mb-4 border-l-4 border-l-primary">
                        <CardContent className="p-4">
                          <div className="text-sm font-medium mb-3">
                            {systemName} - 詳細測試項目
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>測試站點</TableHead>
                                <TableHead>測試項目</TableHead>
                                <TableHead>狀態</TableHead>
                                <TableHead>進度</TableHead>
                                <TableHead>開始日期</TableHead>
                                <TableHead>完成日期</TableHead>
                                <TableHead>備註</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupedRecords[systemName].map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell>{record.station_name}</TableCell>
                                  <TableCell>{record.test_item}</TableCell>
                                  <TableCell>
                                    <Badge className={getStatusColor(record.status)}>
                                      {record.status === 'Done' && '已完成'}
                                      {record.status === 'On-going' && '進行中'}
                                      {record.status === 'Not Start' && '未開始'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-primary rounded-full transition-all"
                                          style={{ width: `${record.progress}%` }}
                                        />
                                      </div>
                                      <span className="text-xs">{record.progress}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">{record.start_date}</TableCell>
                                  <TableCell className="text-xs">{record.completion_date || '-'}</TableCell>
                                  <TableCell className="max-w-24 text-xs truncate">
                                    {record.notes || '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}