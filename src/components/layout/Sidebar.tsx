import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  BarChart3, 
  Settings, 
  FileText, 
  Users, 
  Database, 
  Bug, 
  Wrench,
  ChevronDown,
  ChevronRight,
  Megaphone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const menuItems = [
  { icon: BarChart3, label: "系統儀表板", path: "/" },
  { icon: FileText, label: "測試進度追蹤", path: "/test-tracker" },
  { icon: Megaphone, label: "公告管理", path: "/announcements" },
  {
    icon: Users,
    label: "使用者管理",
    path: "/users",
    subItems: [
      { label: "新增使用者", path: "/users/create" },
      { label: "查詢使用者", path: "/users/search" },
    ],
  },
  {
    icon: Database,
    label: "資料庫管理",
    path: "/database",
    subItems: [
      { label: "備份資料庫", path: "/database/backup" },
      { label: "還原資料庫", path: "/database/restore" },
    ],
  },
  {
    icon: Bug,
    label: "問題追蹤",
    path: "/issues",
    subItems: [
      { label: "提交錯誤報告", path: "/issues/report" },
      { label: "查看錯誤報告", path: "/issues/view" },
    ],
  },
  {
    icon: Wrench,
    label: "系統設定",
    path: "/settings",
    subItems: [
      { label: "修改密碼", path: "/settings/password" },
      { label: "更新個人資料", path: "/settings/profile" },
    ],
  },
];

interface MenuItem {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  path: string;
  subItems?: { label: string; path: string }[];
}

export function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="w-64 border-r flex-none h-full dark:bg-gray-900 dark:border-gray-800">
      <div className="p-4">
        <Link to="/" className="flex items-center text-lg font-semibold">
          <Settings className="mr-2 h-5 w-5" />
          測試管理系統
        </Link>
      </div>
      <div className="p-4 space-y-2">
        {menuItems.map((item: MenuItem) => (
          item.subItems ? (
            <Collapsible key={item.label} className="w-full">
              <CollapsibleTrigger asChild className="w-full">
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-1.5 hover:bg-secondary/50 data-[state=open]:bg-secondary/50"
                  onClick={() => setOpen(!open)}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                  <ChevronDown
                    className={cn("ml-auto h-4 w-4 transition-transform duration-200", open && "rotate-180")}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 space-y-1">
                {item.subItems.map((subItem) => (
                  <Link key={subItem.label} to={subItem.path} className="block">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start px-2 py-1 text-sm hover:bg-secondary/50",
                        location.pathname === subItem.path ? "text-blue-600" : ""
                      )}
                    >
                      {subItem.label}
                    </Button>
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <Link key={item.label} to={item.path} className="block">
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start px-2 py-1.5 hover:bg-secondary/50",
                  location.pathname === item.path ? "text-blue-600" : ""
                )}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </Button>
            </Link>
          )
        ))}
      </div>
    </div>
  );
}
