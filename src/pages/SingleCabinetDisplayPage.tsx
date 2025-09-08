import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { L11CabinetDisplay } from '@/components/cabinet/L11CabinetDisplay';
import { CabinetErrorBoundary } from '@/components/cabinet/CabinetErrorBoundary';
import { useUserPresence } from '@/hooks/useUserPresence';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export default function SingleCabinetDisplayPage() {
  const { cabinetId } = useParams<{ cabinetId: string }>();
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
          activeModule="l11-cabinet" 
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
          <CabinetErrorBoundary fallbackTitle="L11機櫃顯示錯誤">
            <L11CabinetDisplay cabinetId={cabinetId} />
          </CabinetErrorBoundary>
        </main>
      </div>
    </div>
  );
}