import {
  AlertTriangle,
  Factory,
  FileSliders,
  FolderKanban,
  Gauge,
  ListChecks,
  Wrench,
} from "lucide-react";

export const SIDEBAR_STORAGE_KEY = "maintenance-workspace:sidebar-collapsed:v1";

export const maintenanceNavigationItems = [
  { id: "dashboard", label: "系統儀表板", icon: Gauge },
  { id: "test-tracker", label: "L10 測試追蹤", icon: ListChecks },
  { id: "flow-info", label: "L10 流程設定", icon: FileSliders },
  { id: "monitor", label: "生產監控牆", icon: Factory },
  { id: "issues", label: "問題追蹤", icon: AlertTriangle },
  { id: "tools", label: "工具與資產", icon: Wrench },
  { id: "test-plan", label: "資料儲存", icon: FolderKanban },
];

export interface MaintenanceNavigationProps {
  activeModule: string;
  navigationItems: typeof maintenanceNavigationItems;
  onModuleChange: (module: string) => void;
}
