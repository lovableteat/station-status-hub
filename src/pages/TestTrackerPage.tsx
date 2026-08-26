import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TestTracker } from "@/components/test-tracker/TestTracker";
import { TestTrackerErrorBoundary } from '@/components/test-tracker/TestTrackerErrorBoundary';
import { useUserPresence } from '@/hooks/useUserPresence';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export default function TestTrackerPage() {
  const { updateCurrentModule } = useUserPresence();
  const isMobile = useIsMobile();
  
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <Sidebar 
          activeModule="test-tracker" 
          compactBreakpoint="md"
          onModuleChange={updateCurrentModule}
        />
        <main className={cn(
          "flex-1 overflow-auto",
          isMobile && "pt-14"
        )}>
          <TestTrackerErrorBoundary fallbackTitle="GB300 測試追蹤錯誤">
            <TestTracker />
          </TestTrackerErrorBoundary>
        </main>
      </div>
    </div>
  );
}
