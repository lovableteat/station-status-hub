import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { CabinetManagement } from '@/components/cabinet/CabinetManagement';
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

export default function CabinetManagementPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, login, isLoggedIn } = useUser();
  const { updateCurrentModule } = useUserPresence();
  const { isUpdating } = useUnifiedData();
  const isMobile = useIsMobile();

  useEffect(() => {
    updateCurrentModule('cabinet-tracker');
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
    if (module === 'cabinet-tracker') {
      // Stay on current page
      return;
    } else if (module === 'l11-cabinet') {
      navigate('/cabinet/cabinet-001'); // Default cabinet
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
          activeModule="cabinet-tracker"
          onModuleChange={handleNavigation}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobile={isMobile}
        />
        <main className={cn(
          "flex-1 overflow-auto",
          isMobile && "pt-14" // Add top padding on mobile for fixed header
        )}>
          <PermissionGuard module="cabinet-tracker">
            <CabinetManagement />
          </PermissionGuard>
        </main>
      </div>
    </div>
  );
}