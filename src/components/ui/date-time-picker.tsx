import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, ClockIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DateTimePickerProps {
  value?: string
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  minDate?: string
  className?: string
}

// Generate time options (every 30 minutes from 00:00 to 23:30)
const generateTimeOptions = () => {
  const times = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      times.push(timeString)
    }
  }
  return times
}

const timeOptions = generateTimeOptions()

// Quick time options
const quickTimeOptions = [
  { label: "現在", value: "now" },
  { label: "8:00", value: "08:00" },
  { label: "12:00", value: "12:00" },
  { label: "13:00", value: "13:00" },
  { label: "17:30", value: "17:30" },
  { label: "清除", value: "clear" },
]

export function DateTimePicker({
  value,
  onChange,
  placeholder = "選擇日期時間",
  disabled = false,
  minDate,
  className
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date>()
  const [selectedTime, setSelectedTime] = React.useState<string>("")
  const [isDateOpen, setIsDateOpen] = React.useState(false)
  const [isTimeOpen, setIsTimeOpen] = React.useState(false)

  // Parse initial value
  React.useEffect(() => {
    if (value) {
      try {
        const date = new Date(value)
        setSelectedDate(date)
        setSelectedTime(format(date, "HH:mm"))
      } catch {
        setSelectedDate(undefined)
        setSelectedTime("")
      }
    } else {
      setSelectedDate(undefined)
      setSelectedTime("")
    }
  }, [value])

  // Handle date change
  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date)
    setIsDateOpen(false)
    
    if (date && selectedTime) {
      const [hours, minutes] = selectedTime.split(':')
      const newDateTime = new Date(date)
      newDateTime.setHours(parseInt(hours), parseInt(minutes))
      onChange(newDateTime.toISOString())
    } else if (!date) {
      onChange(null)
    }
  }

  // Handle time change
  const handleTimeChange = (time: string) => {
    if (time === "clear") {
      setSelectedTime("")
      setSelectedDate(undefined)
      onChange(null)
      setIsTimeOpen(false)
      return
    }

    if (time === "now") {
      const now = new Date()
      setSelectedDate(now)
      setSelectedTime(format(now, "HH:mm"))
      onChange(now.toISOString())
      setIsTimeOpen(false)
      return
    }

    setSelectedTime(time)
    setIsTimeOpen(false)
    
    if (selectedDate) {
      const [hours, minutes] = time.split(':')
      const newDateTime = new Date(selectedDate)
      newDateTime.setHours(parseInt(hours), parseInt(minutes))
      onChange(newDateTime.toISOString())
    } else {
      // If no date selected, use today
      const today = new Date()
      const [hours, minutes] = time.split(':')
      today.setHours(parseInt(hours), parseInt(minutes))
      setSelectedDate(today)
      onChange(today.toISOString())
    }
  }

  const formattedValue = selectedDate && selectedTime 
    ? `${format(selectedDate, "yyyy-MM-dd")} ${selectedTime}`
    : ""

  const minDateObj = minDate ? new Date(minDate) : undefined

  return (
    <div className={cn("flex gap-1", className)}>
      {/* Date Picker */}
      <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-8 px-2 text-xs font-normal justify-start",
              !selectedDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3 mr-1" />
            {selectedDate ? format(selectedDate, "MM/dd") : "日期"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-popover border-border" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateChange}
            disabled={minDateObj ? (date) => date < minDateObj : undefined}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Time Picker */}
      <Popover open={isTimeOpen} onOpenChange={setIsTimeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-8 px-2 text-xs font-normal justify-start",
              !selectedTime && "text-muted-foreground"
            )}
          >
            <ClockIcon className="h-3 w-3 mr-1" />
            {selectedTime || "時間"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-0 bg-popover border-border" align="start">
          <div className="p-2 space-y-2">
            {/* Quick options */}
            <div className="grid grid-cols-3 gap-1">
              {quickTimeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleTimeChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            
            <div className="border-t border-border pt-2">
              <Select value={selectedTime} onValueChange={handleTimeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="選擇時間" />
                </SelectTrigger>
                <SelectContent className="max-h-48 bg-popover border-border">
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time} className="text-xs">
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}