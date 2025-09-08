import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CabinetInfo } from './CabinetCard';

interface CabinetSwitcherProps {
  currentCabinetId?: string;
  cabinets: CabinetInfo[];
  onCabinetChange: (cabinetId: string) => void;
}

export function CabinetSwitcher({ currentCabinetId, cabinets, onCabinetChange }: CabinetSwitcherProps) {
  const navigate = useNavigate();
  
  const currentCabinet = cabinets.find(c => c.id === currentCabinetId);

  return (
    <div className="flex items-center gap-4 mb-6">
      <Button 
        variant="outline" 
        onClick={() => navigate('/cabinet-management')}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        返回管理頁面
      </Button>
      
      <div className="flex items-center gap-2">
        <Building className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">當前機櫃：</span>
        <Select value={currentCabinetId} onValueChange={onCabinetChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="選擇機櫃" />
          </SelectTrigger>
          <SelectContent>
            {cabinets.map((cabinet) => (
              <SelectItem key={cabinet.id} value={cabinet.id}>
                {cabinet.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {currentCabinet && (
        <div className="text-sm text-muted-foreground">
          {currentCabinet.location}
        </div>
      )}
    </div>
  );
}