
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

const getStatusBadge = (currentStation: string) => {
  // 根據當前站點狀態顯示對應的Badge
  if (currentStation === '已完成') {
    return (
      <Badge className="bg-success text-success-foreground">
        已完成
      </Badge>
    );
  } else if (currentStation === '未開始') {
    return (
      <Badge variant="secondary">
        未開始
      </Badge>
    );
  } else {
    return (
      <Badge className="bg-info text-info-foreground">
        進行中
      </Badge>
    );
  }
};

export function MachineTable() {
  const { systems } = useUnifiedData();
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSystems = systems.filter(system => {
    const matchesFilter = filter === 'all' || 
      (filter === 'completed' && system.current_station === '已完成') ||
      (filter === 'ongoing' && system.current_station !== '已完成' && system.current_station !== '未開始') ||
      (filter === 'not-started' && system.current_station === '未開始');
    
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (system.model || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const completedCount = systems.filter(s => s.current_station === '已完成').length;
  const ongoingCount = systems.filter(s => s.current_station !== '已完成' && s.current_station !== '未開始').length;
  const notStartedCount = systems.filter(s => s.current_station === '未開始').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">機台清單檢視</h3>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="搜尋系統名稱或機種..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.trim().slice(0, 100))}
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
          variant={filter === 'ongoing' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('ongoing')}
        >
          進行中 ({ongoingCount})
        </Button>
        <Button
          variant={filter === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('completed')}
        >
          已完成 ({completedCount})
        </Button>
        <Button
          variant={filter === 'not-started' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('not-started')}
        >
          未開始 ({notStartedCount})
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
                <TableCell>{getStatusBadge(system.current_station)}</TableCell>
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
