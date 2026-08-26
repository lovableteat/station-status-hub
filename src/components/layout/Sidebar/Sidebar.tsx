import {
  useMaxWidth,
  type ResponsiveMaxBreakpoint,
} from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";

import { DesktopMaintenanceSidebar } from "./desktop/DesktopMaintenanceSidebar";
import { MobileMaintenanceNavigation } from "./mobile/MobileMaintenanceNavigation";
import { maintenanceNavigationItems } from "./shared/navigation";

export interface SidebarProps {
  activeModule: string;
  compactBreakpoint?: ResponsiveMaxBreakpoint;
  desktopStickyClass?: string;
  onModuleChange: (module: string) => void;
}

export function Sidebar({
  activeModule,
  compactBreakpoint = "lg",
  desktopStickyClass,
  onModuleChange,
}: SidebarProps) {
  const { canViewModule } = usePermissions();
  const isCompactLayout = useMaxWidth(compactBreakpoint);
  const visibleNavigationItems = maintenanceNavigationItems.filter((item) =>
    canViewModule(item.id)
  );

  if (isCompactLayout) {
    return (
      <MobileMaintenanceNavigation
        activeModule={activeModule}
        navigationItems={visibleNavigationItems}
        onModuleChange={onModuleChange}
      />
    );
  }

  return (
    <DesktopMaintenanceSidebar
      activeModule={activeModule}
      desktopStickyClass={desktopStickyClass}
      navigationItems={visibleNavigationItems}
      onModuleChange={onModuleChange}
    />
  );
}
