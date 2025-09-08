import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sidebar } from "@/components/layout/Sidebar";
import { L11CabinetDisplay } from '@/components/cabinet/L11CabinetDisplay';
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { UpdateIndicator } from "@/components/common/UpdateIndicator";
import { FacebookStyleNotifications } from "@/components/common/FacebookStyleNotifications";
import { OnlineUsersIndicator } from "@/components/common/OnlineUsersIndicator";
import { RealtimeNotifications } from "@/components/common/RealtimeNotifications";
import { useUser } from "@/components/auth/UserContext";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { LoginPage } from "@/components/auth/LoginPage";

export default function SingleCabinetDisplayPage() {
  const { cabinetId } = useParams<{ cabinetId: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, login, isLoggedIn } = useUser();
  const { updateCurrentModule } = useUserPresence();
  const { isUpdating } = useUnifiedData();
  const isMobile = useIsMobile();

  useEffect(() => {
    updateCurrentModule('l11-cabinet');
  }, [updateCurrentModule]);

  if (!isLoggedIn) {
    return <LoginPage onLogin={login} />;
  }

  const handleNavigation = (module: string) => {
    updateCurrentModule(module);
    if (isMobile) {
      setSidebarOpen(false);
    }
    
    // Navigate to different routes based on module
    if (module === 'l11-cabinet') {
      // Stay on current page
      return;
    } else if (module === 'cabinet-tracker') {
      navigate('/cabinet-management');
    } else {
      // Navigate to main index page with module parameter
      navigate(`/?module=${module}`);
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Real-time update indicators */}
      <UpdateIndicator isUpdating={isUpdating} />
      <FacebookStyleNotifications />
      <OnlineUsersIndicator />
      <RealtimeNotifications />
      
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
          onModuleChange={handleNavigation}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobile={isMobile}
        />
        <main className={cn(
          "flex-1 overflow-auto",
          isMobile && "pt-14" // Add top padding on mobile for fixed header
        )}>
          <PermissionGuard module="l11-cabinet">
            <L11CabinetDisplay cabinetId={cabinetId} />
          </PermissionGuard>
        </main>
      </div>
    </div>
  );
}