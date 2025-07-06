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
  projectStartDate: '2025-07-01', // Changed to a reasonable past date
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

  const calculateSystemTimeline = (systemName: string, systems: any[], systemProgress?: number): SystemTimeline => {
    // Find system index (assuming naming pattern like System01, System02, etc.)
    const systemIndex = systems.findIndex(s => s.system_name === systemName);
    const actualIndex = systemIndex >= 0 ? systemIndex : 0;

    // Calculate which day this system starts (5 systems per day)
    const dayOffset = Math.floor(actualIndex / config.systemsPerDay);
    
    // Base start date from config
    const baseStartDate = new Date(config.projectStartDate);
    let workDaysAdded = 0;
    let currentDate = new Date(baseStartDate);

    // Add working days to get to the correct start date
    while (workDaysAdded < dayOffset) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (config.workDays.includes(dayName)) {
        workDaysAdded++;
      }
    }

    // Smart scheduling based on system progress
    const today = new Date();
    let actualStartDate = new Date(currentDate);
    let workDaysForCompletion = 8; // More realistic estimate: 8 working days per system

    // If system has progress > 0, it should have started in the past
    if (systemProgress && systemProgress > 0) {
      // Calculate how many days ago it should have started based on progress
      const progressDays = Math.floor((systemProgress / 100) * workDaysForCompletion);
      const totalElapsedDays = Math.max(progressDays + 2, 5); // At least 5 days ago
      
      // Go back in time to find a reasonable start date
      actualStartDate = new Date(today);
      let daysBack = 0;
      while (daysBack < totalElapsedDays) {
        actualStartDate.setDate(actualStartDate.getDate() - 1);
        const dayName = actualStartDate.toLocaleDateString('en-US', { weekday: 'long' });
        if (config.workDays.includes(dayName)) {
          daysBack++;
        }
      }
    } else if (actualIndex >= 8) {
      // Systems 9+ (index 8+) should start in the future
      // Add extra days for systems that haven't started
      const futureDays = Math.floor((actualIndex - 8) / config.systemsPerDay) + 1;
      let futureDaysAdded = 0;
      while (futureDaysAdded < futureDays) {
        actualStartDate.setDate(actualStartDate.getDate() + 1);
        const dayName = actualStartDate.toLocaleDateString('en-US', { weekday: 'long' });
        if (config.workDays.includes(dayName)) {
          futureDaysAdded++;
        }
      }
    }

    // Calculate end date
    const endDate = new Date(actualStartDate);
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
      startDate: actualStartDate,
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