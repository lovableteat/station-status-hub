import { Search, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterControlsProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterEngineer: string;
  setFilterEngineer: (engineer: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  engineers: string[];
}

export function FilterControls({
  searchTerm,
  setSearchTerm,
  filterEngineer,
  setFilterEngineer,
  filterStatus,
  setFilterStatus,
  engineers,
}: FilterControlsProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋機台編號或負責人..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Select value={filterEngineer} onValueChange={setFilterEngineer}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="選擇工程師" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-engineers">全部工程師</SelectItem>
              {engineers.map(engineer => (
                <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="選擇狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-status">全部狀態</SelectItem>
              <SelectItem value="Not Start">未開始</SelectItem>
              <SelectItem value="On-going">進行中</SelectItem>
              <SelectItem value="Done">已完成</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}