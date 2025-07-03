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

interface Machine {
  sn: string;
  model: string;
  station: string;
  status: 'pending' | 'testing' | 'completed' | 'failed' | 'rework';
  startTime: string;
  estimatedComplete: string;
  operator: string;
}

const machines: Machine[] = [
  { sn: 'GB300-20250703-001', model: 'GB300', station: 'Station 2', status: 'testing', startTime: '09:15', estimatedComplete: '10:45', operator: 'Ben' },
  { sn: 'GB300-20250703-002', model: 'GB300', station: 'Station 3', status: 'testing', startTime: '09:12', estimatedComplete: '12:30', operator: 'Sean' },
  { sn: 'GB200-20250703-008', model: 'GB200', station: 'Station 1', status: 'completed', startTime: '08:30', estimatedComplete: '10:00', operator: 'Martina' },
  { sn: 'GB300-20250703-003', model: 'GB300', station: 'Station 4', status: 'failed', startTime: '07:45', estimatedComplete: '11:30', operator: 'Johnny' },
  { sn: 'GB200-20250703-009', model: 'GB200', station: 'Station 0', status: 'pending', startTime: '-', estimatedComplete: '14:00', operator: '-' },
];

const getStatusBadge = (status: Machine['status']) => {
  const variants = {
    pending: { label: '待測試', variant: 'secondary' as const },
    testing: { label: '測試中', variant: 'default' as const },
    completed: { label: '完成', variant: 'default' as const },
    failed: { label: '失敗', variant: 'destructive' as const },
    rework: { label: '返工', variant: 'outline' as const },
  };
  
  const config = variants[status];
  return (
    <Badge 
      variant={config.variant}
      className={cn(
        status === 'completed' && 'bg-success text-success-foreground',
        status === 'testing' && 'bg-info text-info-foreground',
        status === 'rework' && 'bg-warning text-warning-foreground'
      )}
    >
      {config.label}
    </Badge>
  );
};

export function MachineTable() {
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMachines = machines.filter(machine => {
    const matchesFilter = filter === 'all' || machine.status === filter;
    const matchesSearch = machine.sn.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         machine.model.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">機台清單檢視</h3>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="搜尋 SN 或機種..."
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
          全部 ({machines.length})
        </Button>
        <Button
          variant={filter === 'testing' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('testing')}
        >
          測試中 ({machines.filter(m => m.status === 'testing').length})
        </Button>
        <Button
          variant={filter === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('completed')}
        >
          已完成 ({machines.filter(m => m.status === 'completed').length})
        </Button>
        <Button
          variant={filter === 'failed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('failed')}
        >
          失敗 ({machines.filter(m => m.status === 'failed').length})
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>序列號</TableHead>
              <TableHead>機種</TableHead>
              <TableHead>當前站點</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>開始時間</TableHead>
              <TableHead>預計完成</TableHead>
              <TableHead>操作員</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMachines.map((machine) => (
              <TableRow key={machine.sn} className="hover:bg-muted/50">
                <TableCell className="font-mono text-sm">{machine.sn}</TableCell>
                <TableCell>{machine.model}</TableCell>
                <TableCell>{machine.station}</TableCell>
                <TableCell>{getStatusBadge(machine.status)}</TableCell>
                <TableCell>{machine.startTime}</TableCell>
                <TableCell>{machine.estimatedComplete}</TableCell>
                <TableCell>{machine.operator}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}