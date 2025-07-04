import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SystemTimelineConfig {
  projectStartDate: string;
  systemsPerDay: number;
  workDays: string[];
  dailyWorkHours: number;
}

interface SystemTimeline {
  systemName: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
}

const DEFAULT_CONFIG: SystemTimelineConfig = {
  projectStartDate: '2025-07-21',
  systemsPerDay: 5,
  workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  dailyWorkHours: 8
};

export function useSystemTimeline() {
  const [config, setConfig] = useState<SystemTimelineConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTimelineConfig();
  }, []);

  const loadTimelineConfig = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('category', 'work_time')
        .single();

      if (data?.settings) {
        const settings = data.settings as any;
        setConfig({
          projectStartDate: settings.project_start_date || DEFAULT_CONFIG.projectStartDate,
          systemsPerDay: settings.systems_per_day || DEFAULT_CONFIG.systemsPerDay,
          workDays: settings.work_days || DEFAULT_CONFIG.workDays,
          dailyWorkHours: settings.daily_work_hours || DEFAULT_CONFIG.dailyWorkHours
        });
      }
    } catch (error) {
      console.error('Error loading timeline config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateSystemTimeline = (systemName: string, systems: any[]): SystemTimeline => {
    // Find system index (assuming naming pattern like System01, System02, etc.)
    const systemIndex = systems.findIndex(s => s.system_name === systemName);
    const actualIndex = systemIndex >= 0 ? systemIndex : 0;

    // Calculate which day this system starts (5 systems per day)
    const dayOffset = Math.floor(actualIndex / config.systemsPerDay);
    
    // Calculate start date
    const startDate = new Date(config.projectStartDate);
    let workDaysAdded = 0;
    let currentDate = new Date(startDate);

    // Add working days to get to the correct start date
    while (workDaysAdded < dayOffset) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (config.workDays.includes(dayName)) {
        workDaysAdded++;
      }
    }

    // Estimate end date (assuming 1 day per system for now, can be adjusted)
    const endDate = new Date(currentDate);
    let workDaysForCompletion = 1; // Default to 1 working day per system
    let workDaysCompleted = 0;

    while (workDaysCompleted < workDaysForCompletion) {
      endDate.setDate(endDate.getDate() + 1);
      const dayName = endDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (config.workDays.includes(dayName)) {
        workDaysCompleted++;
      }
    }

    return {
      systemName,
      startDate: currentDate,
      endDate,
      workingDays: workDaysForCompletion
    };
  };

  const getNextWorkingDay = (date: Date): Date => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const dayName = nextDay.toLocaleDateString('en-US', { weekday: 'long' });
    if (config.workDays.includes(dayName)) {
      return nextDay;
    }
    
    return getNextWorkingDay(nextDay);
  };

  const isWorkingDay = (date: Date): boolean => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return config.workDays.includes(dayName);
  };

  return {
    config,
    isLoading,
    calculateSystemTimeline,
    getNextWorkingDay,
    isWorkingDay,
    loadTimelineConfig
  };
}