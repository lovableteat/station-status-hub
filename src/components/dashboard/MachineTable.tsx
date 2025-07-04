import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUnifiedData } from "@/hooks/useUnifiedData";

const getStatusBadge = (status: string) => {
  const variants = {
    'Not Start': { label: '待測試', variant: 'secondary' as const },
    'On-going': { label: '測試中', variant: 'default' as const },
    'Done': { label: '完成', variant: 'default' as const },
    'Failed': { label: '失敗', variant: 'destructive' as const },
    'Rework': { label: '返工', variant: 'outline' as const },
  };
  
  const config = variants[status as keyof typeof variants] || variants['Not Start'];
  return (
    <Badge 
      variant={config.variant}
      className={cn(
        status === 'Done' && 'bg-success text-success-foreground',
        status === 'On-going' && 'bg-info text-info-foreground',
        status === 'Rework' && 'bg-warning text-warning-foreground'
      )}
    >
      {config.label}
    </Badge>
  );
};

export function MachineTable() {
  const { systems } = useUnifiedData();
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSystems = systems.filter(system => {
    const matchesFilter = filter === 'all' || system.status === filter;
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (system.model || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">機台清單檢視</h3>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="搜尋系統名稱或機種..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-60"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          全部 ({systems.length})
        </Button>
        <Button
          variant={filter === 'On-going' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('On-going')}
        >
          測試中 ({systems.filter(s => s.status === 'On-going').length})
        </Button>
        <Button
          variant={filter === 'Done' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('Done')}
        >
          已完成 ({systems.filter(s => s.status === 'Done').length})
        </Button>
        <Button
          variant={filter === 'Not Start' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('Not Start')}
        >
          未開始 ({systems.filter(s => s.status === 'Not Start').length})
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>系統名稱</TableHead>
              <TableHead>機種</TableHead>
              <TableHead>當前站點</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>進度</TableHead>
              <TableHead>負責工程師</TableHead>
              <TableHead>序列號</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSystems.map((system) => (
              <TableRow key={system.id} className="hover:bg-muted/50">
                <TableCell className="font-mono text-sm">{system.system_name}</TableCell>
                <TableCell>{system.model || 'GB300'}</TableCell>
                <TableCell>{system.current_station}</TableCell>
                <TableCell>{getStatusBadge(system.status)}</TableCell>
                <TableCell>{system.overall_progress || 0}%</TableCell>
                <TableCell>{system.assigned_engineer}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{system.serial_number || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}