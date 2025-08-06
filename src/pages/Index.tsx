
import { Dashboard } from "@/components/dashboard/Dashboard";
import { NewNotificationCenter } from "@/components/common/NewNotificationCenter";
import { NotificationTester } from "@/components/common/NotificationTester";
import { useUser } from "@/components/auth/UserContext";

export default function Index() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-between items-center p-4 border-b">
        <h1 className="text-2xl font-bold">測試追蹤系統</h1>
        <div className="flex items-center gap-4">
          {user && <NewNotificationCenter />}
          {user && (
            <span className="text-sm text-muted-foreground">
              歡迎, {user.displayName}
            </span>
          )}
        </div>
      </div>
      
      <div className="container mx-auto py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Dashboard />
          </div>
          <div className="space-y-6">
            <NotificationTester />
          </div>
        </div>
      </div>
    </div>
  );
}
