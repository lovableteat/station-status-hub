
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StationStatusSelectorProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  className?: string;
}

const statusOptions = [
  { value: '未開始', label: '未開始', color: 'bg-gray-500 text-white' },
  { value: '進行中', label: '進行中', color: 'bg-warning text-warning-foreground' },
  { value: '已完成', label: '已完成', color: 'bg-green-500 text-white' },
];

export function StationStatusSelector({ currentStatus, onStatusChange, className }: StationStatusSelectorProps) {
  const currentOption = statusOptions.find(option => option.value === currentStatus);

  return (
    <Select value={currentStatus} onValueChange={onStatusChange}>
      <SelectTrigger className={cn("w-28", className)}>
        <SelectValue>
          <Badge 
            variant="secondary" 
            className={cn(
              "px-2 py-1 rounded-full font-medium text-xs",
              currentOption?.color || "bg-gray-500 text-white"
            )}
          >
            {currentStatus}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-white border shadow-lg z-50">
        {statusOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <Badge 
              variant="secondary" 
              className={cn(
                "px-2 py-1 rounded-full font-medium text-xs",
                option.color
              )}
            >
              {option.label}
            </Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
