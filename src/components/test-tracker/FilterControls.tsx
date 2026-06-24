import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterControlsProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterEngineer: string;
  setFilterEngineer: (engineer: string) => void;
  engineers: string[];
}

export function FilterControls({
  searchTerm,
  setSearchTerm,
  filterEngineer,
  setFilterEngineer,
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
              <SelectValue placeholder="全部工程師" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-engineers">全部工程師</SelectItem>
              {engineers.map((engineer) => (
                <SelectItem key={engineer} value={engineer}>
                  {engineer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
