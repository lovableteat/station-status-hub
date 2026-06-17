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
    <Card className="border-primary/15 bg-card/90 shadow-[0_18px_48px_-38px_hsl(220_50%_2%/0.9)]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/85" />
              <Input
                placeholder="搜尋機台編號或負責人..."
                className="h-12 border-primary/25 bg-secondary/80 pl-11 text-sm focus-visible:border-primary/80"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value.trim().slice(0, 100))}
              />
            </div>
          </div>
          <Select value={filterEngineer} onValueChange={setFilterEngineer}>
            <SelectTrigger className="h-12 w-full border-border/90 bg-secondary/80 lg:w-52">
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
            <SelectTrigger className="h-12 w-full border-border/90 bg-secondary/80 lg:w-52">
              <SelectValue placeholder="選擇狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-status">全部狀態</SelectItem>
              <SelectItem value="未開始">未開始</SelectItem>
              <SelectItem value="進行中">進行中</SelectItem>
              <SelectItem value="已完成">已完成</SelectItem>
              <SelectItem value="Not Start">Not Start</SelectItem>
              <SelectItem value="On-going">On-going</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
