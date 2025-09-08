import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TestTracker } from "@/components/test-tracker/TestTracker";
import { CabinetErrorBoundary } from '@/components/cabinet/CabinetErrorBoundary';
import { useUserPresence } from '@/hooks/useUserPresence';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export default function TestTrackerPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { updateCurrentModule } = useUserPresence();
  const isMobile = useIsMobile();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <div className="flex min-h-screen">
        <Sidebar 
          activeModule="test-tracker" 
          onModuleChange={(module) => {
            updateCurrentModule(module);
            if (isMobile) setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobile={isMobile}
        />
        <main className={cn(
          "flex-1 overflow-auto",
          isMobile && "pt-14"
        )}>
          <CabinetErrorBoundary fallbackTitle="測試追蹤頁面錯誤">
            <TestTracker />
          </CabinetErrorBoundary>
        </main>
      </div>
    </div>
  );
}