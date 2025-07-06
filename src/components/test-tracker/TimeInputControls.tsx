import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeInputControlsProps {
  label: string;
  value?: string;
  onChange: (value?: string) => void;
  minValue?: string;
  disabled?: boolean;
  isMobile?: boolean;
  className?: string;
}

export function TimeInputControls({
  label,
  value,
  onChange,
  minValue,
  disabled = false,
  isMobile = false,
  className
}: TimeInputControlsProps) {
  const [dateValue, setDateValue] = useState(() => {
    if (!value) return '';
    try {
      return new Date(value).toISOString().split('T')[0];
    } catch {
      return '';
    }
  });

  const [timeValue, setTimeValue] = useState(() => {
    if (!value) return '';
    try {
      return new Date(value).toTimeString().slice(0, 5);
    } catch {
      return '';
    }
  });

  const updateDateTime = (newDate: string, newTime: string) => {
    if (!newDate || !newTime) {
      onChange(undefined);
      return;
    }

    try {
      const combined = new Date(`${newDate}T${newTime}`);
      onChange(combined.toISOString());
    } catch {
      onChange(undefined);
    }
  };

  const handleQuickSet = (type: 'now' | 'start-of-day' | 'end-of-day') => {
    const now = new Date();
    let targetDate: Date;

    switch (type) {
      case 'now':
        targetDate = now;
        break;
      case 'start-of-day':
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0);
        break;
      case 'end-of-day':
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 30);
        break;
      default:
        targetDate = now;
    }

    const newDate = targetDate.toISOString().split('T')[0];
    const newTime = targetDate.toTimeString().slice(0, 5);
    
    setDateValue(newDate);
    setTimeValue(newTime);
    onChange(targetDate.toISOString());
  };

  const handleDateChange = (newDate: string) => {
    setDateValue(newDate);
    updateDateTime(newDate, timeValue);
  };

  const handleTimeChange = (newTime: string) => {
    setTimeValue(newTime);
    updateDateTime(dateValue, newTime);
  };

  const formatDisplayTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      return new Date(timeStr).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Label className={isMobile ? "text-base font-medium block" : ""}>{label}</Label>
      
      {/* Quick Set Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size={isMobile ? "default" : "sm"}
          className={cn("text-xs", isMobile && "h-10 text-sm")}
          onClick={() => handleQuickSet('now')}
          disabled={disabled}
        >
          <Clock className="h-3 w-3 mr-1" />
          現在
        </Button>
        <Button
          type="button"
          variant="outline"
          size={isMobile ? "default" : "sm"}
          className={cn("text-xs", isMobile && "h-10 text-sm")}
          onClick={() => handleQuickSet('start-of-day')}
          disabled={disabled}
        >
          早上8點
        </Button>
        <Button
          type="button"
          variant="outline"
          size={isMobile ? "default" : "sm"}
          className={cn("text-xs", isMobile && "h-10 text-sm")}
          onClick={() => handleQuickSet('end-of-day')}
          disabled={disabled}
        >
          下午5:30
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn("text-xs text-muted-foreground", isMobile && "h-10 text-sm")}
            onClick={() => {
              setDateValue('');
              setTimeValue('');
              onChange(undefined);
            }}
            disabled={disabled}
          >
            清除
          </Button>
        )}
      </div>

      {/* Date and Time Inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">日期</Label>
          <Input
            type="date"
            value={dateValue}
            onChange={(e) => handleDateChange(e.target.value)}
            min={minValue ? new Date(minValue).toISOString().split('T')[0] : undefined}
            className={isMobile ? "h-10 text-sm" : "h-8 text-sm"}
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">時間</Label>
          <Input
            type="time"
            value={timeValue}
            onChange={(e) => handleTimeChange(e.target.value)}
            className={isMobile ? "h-10 text-sm" : "h-8 text-sm"}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Display Current Value */}
      {value && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          設定時間: {formatDisplayTime(value)}
        </div>
      )}
    </div>
  );
}