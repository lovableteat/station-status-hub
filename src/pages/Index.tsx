
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { UserProvider } from "@/components/auth/UserContext";
import { SimpleNotificationViewer } from "@/components/common/SimpleNotificationViewer";

export default function Index() {
  return (
    <UserProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="flex justify-between items-center p-4 border-b">
            <h1 className="text-2xl font-bold">測試追蹤系統</h1>
            <SimpleNotificationViewer />
          </div>
          <Dashboard />
        </main>
      </div>
    </UserProvider>
  );
}
